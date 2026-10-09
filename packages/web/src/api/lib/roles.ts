export const ROLES = ["super_admin", "admin", "staff", "client"] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_ROLES: Role[] = ["super_admin", "admin"];
export const OPERATOR_ROLES: Role[] = ["super_admin", "admin", "staff"];

/** Where each role lands after sign-in. Mirrored on the web in lib/roles.ts. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  super_admin: "/admin",
  admin: "/admin",
  staff: "/staff",
  client: "/dashboard",
};

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);
