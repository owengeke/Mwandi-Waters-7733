import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { BrandMark } from "./app-shell";
import { ThemeSwitcher, ThemeToggle } from "./theme-switcher";
import { cn } from "../lib/utils";
import { useMe, useSignOut } from "../queries/portal";

const NAV = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "bills", label: "Bills", Icon: ReceiptText },
  { id: "payments", label: "Payments", Icon: Wallet },
  { id: "usage", label: "Usage", Icon: BarChart3 },
  { id: "account", label: "Account", Icon: UserRound },
] as const;

type SectionID = (typeof NAV)[number]["id"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function statusCopy(status?: string) {
  if (status === "SUSPENDED") return { label: "Service status: limited", tone: "bg-warning" };
  if (status === "DISCONNECTED") return { label: "Service status: disconnected", tone: "bg-destructive" };
  if (status === "ACTIVE") return { label: "Service status: operational", tone: "bg-success" };
  return { label: "Checking service status…", tone: "bg-muted-foreground/50" };
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="~/" className="flex items-center gap-2.5" aria-label="Mwandi Waters home">
      <BrandMark className="size-9" />
      <span className="leading-tight">
        <span className="block font-display text-[16px] font-bold tracking-tight">Mwandi Waters</span>
        {!compact && (
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Customer portal
          </span>
        )}
      </span>
    </Link>
  );
}

function NavLinks({ active, onNavigate }: { active: SectionID; onNavigate?: () => void }) {
  const go = (id: SectionID) => {
    const el = document.getElementById(id);
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    }
    onNavigate?.();
  };

  return (
    <nav className="flex flex-col gap-1" aria-label="Customer portal">
      {NAV.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              go(id);
            }}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />}
            <Icon className={cn("size-4", isActive && "text-primary")} />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

function AccountCard({ onSignOut, signingOut }: { onSignOut: () => void; signingOut: boolean }) {
  const me = useMe();
  const name = me.data?.name ?? "Mwandi customer";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-card/70 p-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">Client</p>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        disabled={signingOut}
        onClick={onSignOut}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function ClientShell({
  children,
  status,
}: {
  children: React.ReactNode;
  status?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SectionID>("overview");
  const me = useMe();
  const signOut = useSignOut();
  const [, navigate] = useLocation();
  const service = statusCopy(status);

  // Scroll spy for the anchor navigation.
  useEffect(() => {
    const sections = NAV.map((n) => document.getElementById(n.id)).filter((el): el is HTMLElement => !!el);
    if (!sections.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id as SectionID);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const doSignOut = () =>
    signOut.mutate(undefined, { onSettled: () => navigate("~/login", { replace: true }) });

  return (
    <div className="min-h-dvh bg-background lg:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <div className="px-1">
          <Brand />
        </div>
        <div className="mt-9 flex-1">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </p>
          <NavLinks active={active} />
        </div>
        <div className="space-y-3 border-t border-sidebar-border pt-4">
          <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-primary/8 p-4">
            <p className="text-sm font-semibold text-foreground">Every drop counts.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Keep your water account up to date.
            </p>
            <svg viewBox="0 0 80 80" className="pointer-events-none absolute -bottom-5 -right-4 size-20 text-primary/15" aria-hidden>
              <circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="8" />
              <circle cx="40" cy="40" r="16" fill="none" stroke="currentColor" strokeWidth="6" />
            </svg>
          </div>
          <div>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Appearance
            </p>
            <ThemeSwitcher />
          </div>
          <AccountCard onSignOut={doSignOut} signingOut={signOut.isPending} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand compact />
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

      {/* Desktop top bar */}
      <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-border/70 bg-background/80 px-8 backdrop-blur lg:flex">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-full", service.tone)} aria-hidden />
          {service.label}
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              {initials(me.data?.name ?? "Mwandi customer")}
            </span>
            <span className="text-xs font-semibold">{me.data?.name ?? "Mwandi customer"}</span>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-[#0B132B]/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-sidebar p-5 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-start justify-between">
              <Brand />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="p-1.5">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Workspace
              </p>
              <NavLinks active={active} onNavigate={() => setOpen(false)} />
            </div>
            <div className="space-y-3">
              <ThemeSwitcher />
              <AccountCard onSignOut={doSignOut} signingOut={signOut.isPending} />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
