import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useMe } from "../queries/portal";
import { HOME_FOR_ROLE, type Role } from "../lib/roles";

export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/**
 * Blocks rendering until the session is known.
 *  • signed out      → /login?next=<current path>
 *  • wrong role      → that role's own home
 * The API enforces the same roles server-side; this guard is for UX.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const me = useMe();
  const [location] = useLocation();

  if (me.isLoading) return <FullScreenLoader label="Checking your session…" />;
  if (!me.data) {
    const full = typeof window !== "undefined" ? window.location.pathname : location;
    // `~/` forces an absolute path — these guards also render inside nested
    // /admin and /staff routes, where a relative redirect resolves to a dead URL.
    return <Redirect to={`~/login?next=${encodeURIComponent(full)}`} replace />;
  }
  if (!roles.includes(me.data.role)) return <Redirect to={`~${HOME_FOR_ROLE[me.data.role]}`} replace />;
  return <>{children}</>;
}
