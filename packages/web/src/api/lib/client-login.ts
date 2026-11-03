import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { auth } from "../auth";
import { db } from "../database";
import { user as userTable } from "../database/schema";

export interface ClientLoginInput {
  name: string;
  email?: string | null;
  phoneNumber: string;
  clientId: number;
  /** Used to derive a unique placeholder email when the client has none. */
  accountNumber: string;
  /** Better Auth credential hash from onboarding step 4, or null when not set yet. */
  passwordHash?: string | null;
}

/**
 * Creates the one login attached to a water account.
 *
 * The phone number is the identity used by the unified portal, so a second
 * login for the same phone is refused rather than silently merged.
 */
export async function createClientLogin(input: ClientLoginInput) {
  const ctx = await auth.$context;
  const preferredEmail =
    input.email?.trim().toLowerCase() || `${input.accountNumber.toLowerCase()}@clients.mwandiwaters.co.ke`;

  const [phoneTaken] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.phoneNumber, input.phoneNumber));
  if (phoneTaken) {
    throw new ORPCError("CONFLICT", {
      message: "A login already exists for this phone number.",
    });
  }

  // An email may already belong to a staff login; fall back to the account
  // address so the client still gets exactly one login.
  const [emailTaken] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, preferredEmail));
  const email = emailTaken
    ? `${input.accountNumber.toLowerCase()}@clients.mwandiwaters.co.ke`
    : preferredEmail;

  const created = await ctx.internalAdapter.createUser({
    name: input.name,
    email,
    emailVerified: false,
    role: "client",
    phoneNumber: input.phoneNumber,
    clientId: input.clientId,
  });

  if (input.passwordHash) {
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: input.passwordHash,
    });
  }

  return created;
}

/**
 * Sets or replaces the password on an existing client login. `passwordHash`
 * must already be a Better Auth hash (never plain text).
 */
export async function setClientPassword(clientId: number, passwordHash: string) {
  const ctx = await auth.$context;
  const [user] = await db.select().from(userTable).where(eq(userTable.clientId, clientId));
  if (!user) throw new ORPCError("NOT_FOUND", { message: "No login is linked to this account." });

  const accounts = await ctx.internalAdapter.findAccountByUserId(user.id);
  const credential = accounts.find((account) => account.providerId === "credential");

  if (credential) {
    await ctx.internalAdapter.updatePassword(user.id, passwordHash);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: passwordHash,
    });
  }
}