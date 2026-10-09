// Mirrors src/api/lib/roles.ts
export type Role = "super_admin" | "admin" | "staff" | "client";

export const HOME_FOR_ROLE: Record<Role, string> = {
  super_admin: "/admin",
  admin: "/admin",
  staff: "/staff",
  client: "/dashboard",
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Administrator",
  staff: "Staff",
  client: "Customer",
};

/** Is `path` inside an area this role may enter? Used to honour ?next= safely. */
export function canAccess(role: Role, path: string) {
  if (path.startsWith("/admin")) return role === "super_admin" || role === "admin";
  if (path.startsWith("/staff")) return role === "staff";
  if (path.startsWith("/dashboard")) return role === "client";
  return false;
}
