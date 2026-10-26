/**
 * Mwandi Waters unified sign-in — a Better Auth plugin.
 *
 * One identifier field accepts Email, Phone (07…/+254…) or Account Number (ACC-XXXX).
 * Two secrets:
 *   POST /api/auth/portal/sign-in     { identifier, password }
 *   POST /api/auth/portal/otp/send    { identifier }            → 6-digit code over WhatsApp (SMS fallback)
 *   POST /api/auth/portal/otp/verify  { identifier, code }
 * Success sets the session cookie and (via bearer()) the `set-auth-token` header.
 *
 * Clients who have a water account but have never signed in get a user record
 * provisioned on their first OTP request (role "client", linked by client_id).
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { db } from "../database";
import { clients, user as userTable } from "../database/schema";
import { deliverOtp, otpDeliveryConfigured, type DeliveryChannel } from "./notify";

const OTP_TTL_SEC = 300;
const OTP_MAX_ATTEMPTS = 5;
const INVALID = "Invalid credentials. Check your details and try again.";

type Kind = "email" | "account" | "phone";

function classify(raw: string): { kind: Kind; value: string } | null {
  const v = raw.trim();
  if (v.includes("@")) return { kind: "email", value: v.toLowerCase() };
  if (/^acc-?\d{1,}$/i.test(v)) {
    const n = v.replace(/\D/g, "");
    return { kind: "account", value: `ACC-${n.padStart(4, "0")}` };
  }
  const p = v.replace(/[\s-]/g, "");
  if (/^(?:\+?254|0)[17]\d{8}$/.test(p)) return { kind: "phone", value: "+254" + p.replace(/^(?:\+?254|0)/, "") };
  return null;
}

type UserRow = typeof userTable.$inferSelect;

async function findUser(identifier: string): Promise<{ user: UserRow | null; client: typeof clients.$inferSelect | null }> {
  const id = classify(identifier);
  if (!id) return { user: null, client: null };

  if (id.kind === "email") {
    const [u] = await db.select().from(userTable).where(eq(userTable.email, id.value));
    return { user: u ?? null, client: null };
  }
  if (id.kind === "phone") {
    const [u] = await db.select().from(userTable).where(eq(userTable.phoneNumber, id.value));
    if (u) return { user: u, client: null };
    const [c] = await db.select().from(clients).where(eq(clients.phoneNumber, id.value));
    if (!c) return { user: null, client: null };
    const [cu] = await db.select().from(userTable).where(eq(userTable.clientId, c.id));
    return { user: cu ?? null, client: c };
  }
  const [c] = await db.select().from(clients).where(eq(clients.accountNumber, id.value));
  if (!c) return { user: null, client: null };
  const [cu] = await db.select().from(userTable).where(eq(userTable.clientId, c.id));
  return { user: cu ?? null, client: c };
}

const hash = (code: string, salt: string) => createHash("sha256").update(`${salt}:${code}`).digest("hex");
const maskPhone = (p: string) => p.replace(/^(\+254)(\d{3})\d{3}(\d{3})$/, "$1 $2 *** $3");
const otpKey = (userId: string) => `portal-otp:${userId}`;

const identifierSchema = z.string().trim().min(3).max(120);

export const portalAuth = () =>
  ({
    id: "mwandi-portal",
    rateLimit: [
      { pathMatcher: (p) => p === "/portal/otp/send", window: 60, max: 3 },
      { pathMatcher: (p) => p.startsWith("/portal/"), window: 60, max: 10 },
    ],
    endpoints: {
      portalSignIn: createAuthEndpoint(
        "/portal/sign-in",
        { method: "POST", body: z.object({ identifier: identifierSchema, password: z.string().min(1).max(256) }) },
        async (ctx) => {
          const { user } = await findUser(ctx.body.identifier);
          const account = user
            ? (await ctx.context.internalAdapter.findAccountByUserId(user.id)).find((a) => a.providerId === "credential")
            : undefined;
          const ok =
            !!account?.password && (await ctx.context.password.verify({ hash: account.password, password: ctx.body.password }));
          if (!user || !ok) throw new APIError("UNAUTHORIZED", { message: INVALID });

          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user: user as any });
          return ctx.json({ token: session.token, user: { id: user.id, name: user.name, role: user.role } });
        },
      ),

      portalOtpSend: createAuthEndpoint(
        "/portal/otp/send",
        { method: "POST", body: z.object({ identifier: identifierSchema }) },
        async (ctx) => {
          let { user, client } = await findUser(ctx.body.identifier);

          // First-time client sign-in: provision a portal user for an existing water account.
          if (!user && client) {
            user = (await ctx.context.internalAdapter.createUser({
              email: `${client.accountNumber.toLowerCase()}@clients.mwandiwaters.co.ke`,
              name: client.fullName,
              emailVerified: false,
              role: "client",
              phoneNumber: client.phoneNumber,
              clientId: client.id,
            })) as unknown as UserRow;
          }

          const phone = user?.phoneNumber ?? client?.phoneNumber;
          // Same response shape whether or not the identifier exists (no account enumeration).
          if (!user || !phone) return ctx.json({ sent: true, channel: null, destination: null, expiresIn: OTP_TTL_SEC });

          const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
          const salt = crypto.randomUUID();
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(otpKey(user.id));
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: otpKey(user.id),
            value: JSON.stringify({ h: hash(code, salt), s: salt, a: 0 }),
            expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000),
          });

          let channel: DeliveryChannel;
          try {
            ({ channel } = await deliverOtp(phone, code));
          } catch (error) {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(otpKey(user.id));
            console.error("[portal] could not deliver sign-in code", error);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "We couldn't send your sign-in code. Please try again.",
            });
          }

          const exposeCode = !otpDeliveryConfigured() && process.env.NODE_ENV !== "production";
          return ctx.json({
            sent: true,
            channel,
            destination: maskPhone(phone),
            expiresIn: OTP_TTL_SEC,
            ...(exposeCode ? { devCode: code } : {}),
          });
        },
      ),

      portalOtpVerify: createAuthEndpoint(
        "/portal/otp/verify",
        {
          method: "POST",
          body: z.object({ identifier: identifierSchema, code: z.string().trim().regex(/^\d{6}$/) }),
        },
        async (ctx) => {
          const { user } = await findUser(ctx.body.identifier);
          if (!user) throw new APIError("UNAUTHORIZED", { message: "Invalid or expired code." });

          const key = otpKey(user.id);
          const record = await ctx.context.internalAdapter.findVerificationValue(key);
          if (!record || new Date(record.expiresAt) < new Date()) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid or expired code." });
          }
          const data = JSON.parse(record.value) as { h: string; s: string; a: number };
          if (data.a >= OTP_MAX_ATTEMPTS) {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(key);
            throw new APIError("FORBIDDEN", { message: "Too many attempts. Request a new code." });
          }
          const match = timingSafeEqual(Buffer.from(hash(ctx.body.code, data.s)), Buffer.from(data.h));
          if (!match) {
            await ctx.context.internalAdapter.updateVerificationByIdentifier(key, {
              value: JSON.stringify({ ...data, a: data.a + 1 }),
            });
            throw new APIError("UNAUTHORIZED", { message: "Invalid or expired code." });
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(key);

          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user: user as any });
          return ctx.json({ token: session.token, user: { id: user.id, name: user.name, role: user.role } });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
