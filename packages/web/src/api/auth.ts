import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db } from "./database";
import { portalAuth } from "./lib/portal-auth";

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  // Accounts are created by admins (staff) or provisioned on first OTP (clients) — no public sign-up.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  secret: process.env.BETTER_AUTH_SECRET,
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 100 },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "client", input: false },
      phoneNumber: { type: "string", required: false, unique: true, input: false },
      clientId: { type: "number", required: false, input: false },
    },
  },
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    return origin ? [origin] : ["*"];
  },
  plugins: [bearer(), expo(), portalAuth()],
});
