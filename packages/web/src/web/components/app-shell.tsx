import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, LayoutDashboard, LogOut, Menu, ReceiptText, Users, Wallet, X } from "lucide-react";
import { ThemeSwitcher, ThemeToggle } from "./theme-switcher";
import { cn } from "../lib/utils";
import { useMe, useSignOut } from "../queries/portal";
import { ROLE_LABEL } from "../lib/roles";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/installations", label: "Installations", Icon: ClipboardList },
  { href: "/clients", label: "Clients", Icon: Users },
  { href: "/invoices", label: "Invoices", Icon: ReceiptText },
  { href: "/payments", label: "Payments", Icon: Wallet },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M6 12c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.6 5-1.2M6 17c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.6 5-1.2M6 22c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.6 5-1.2"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <BrandMark className="size-8" />
      <span className="leading-none">
        <span className="block font-display text-[15px] font-bold tracking-tight text-foreground">Mwandi Waters</span>
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Utility console
        </span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ href, label, Icon }) => {
        const active = href === "/" ? location === "/" : location.startsWith(href);
        return (
          <Link
            key={href}
            to={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />}
            <Icon className={cn("size-4", active ? "text-primary" : "")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Account() {
  const me = useMe();
  const signOut = useSignOut();
  const [, navigate] = useLocation();
  if (!me.data) return null;
  const initials = me.data.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
        {initials}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold text-foreground">{me.data.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABEL[me.data.role]}</p>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate(undefined, { onSettled: () => navigate("~/login", { replace: true }) })}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <div className="px-1">
          <Brand />
        </div>
        <div className="mt-8 flex-1">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Operations
          </p>
          <NavLinks />
        </div>
        <div className="space-y-3 border-t border-sidebar-border pt-4">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appearance</p>
          <ThemeSwitcher />
          <p className="px-1 text-[11px] text-muted-foreground">
            Tariff <span className="font-mono text-foreground">KES 150</span> / unit
          </p>
          <Account />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="inline-flex size-9 items-center justify-center rounded-lg border bg-card"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar p-5 shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="p-1">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <div className="space-y-3">
              <ThemeSwitcher />
              <Account />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
