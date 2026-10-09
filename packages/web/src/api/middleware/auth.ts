import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";
import { ADMIN_ROLES, OPERATOR_ROLES, isRole, type Role } from "../lib/roles";

/** Optional auth — `context.user` is the session user or null. */
export const withUser = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  return next({ context: { user: session?.user ?? null, session: session?.session ?? null } });
});

/** Any signed-in user. */
export const authed = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Sign in required" });
  const role: Role = isRole(session.user.role) ? session.user.role : "client";
  return next({ context: { user: { ...session.user, role }, session: session.session } });
});

const requireRole = (allowed: Role[]) =>
  authed.use(({ context, next }) => {
    if (!allowed.includes(context.user.role)) throw new ORPCError("FORBIDDEN", { message: "Not permitted" });
    return next();
  });

/** super_admin, admin, staff — day-to-day utility operations. */
export const operator = requireRole(OPERATOR_ROLES);
/** super_admin, admin — configuration, user management. */
export const adminOnly = requireRole(ADMIN_ROLES);
/** Signed-in client linked to a water account. */
export const clientOnly = requireRole(["client"]);
