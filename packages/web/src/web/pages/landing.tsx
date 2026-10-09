import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, CircleX, ClipboardCheck, Droplets, Phone, Search, ShieldCheck, Wallet, Wrench } from "lucide-react";
import { BrandMark } from "../components/app-shell";
import { ThemeToggle } from "../components/theme-switcher";
import { Modal } from "../components/modal";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { StatusBadge } from "../components/status-badge";
import { Code } from "../components/code";
import { useApplyConnection, useMe, useTrackApplication } from "../queries/portal";
import { formatDate, formatKES } from "../lib/format";
import { cn } from "../lib/utils";

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

/* ---------------- Navbar ---------------- */

function Navbar() {
  const me = useMe();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="font-display text-[17px] font-bold tracking-tight text-foreground">Mwandi Waters</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {me.data ? (
            <Link
              to={me.data.home}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Go to dashboard <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------------- Apply modal ---------------- */

function ApplyModal({ open, onClose, onTrack }: { open: boolean; onClose: () => void; onTrack: (ref: string) => void }) {
  const apply = useApplyConnection();
  const [form, setForm] = useState({ fullName: "", phoneNumber: "", physicalAddress: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    onClose();
    if (apply.isSuccess) {
      apply.reset();
      setForm({ fullName: "", phoneNumber: "", physicalAddress: "" });
    }
  };

  const ref = apply.data?.referenceNumber;

  return (
    <Modal
      open={open}
      onClose={close}
      title={ref ? "Application received" : "Apply for a new connection"}
      description={ref ? undefined : "Tell us who you are and where the meter should go. A surveyor will review it within 3 working days."}
    >
      {ref ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-primary/25 bg-primary/6 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your reference number</p>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-primary">{ref}</p>
            <p className="mt-2 text-sm text-muted-foreground">Keep this — you'll need it to track your application.</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} className="h-11 rounded-lg border px-5 text-sm font-semibold hover:bg-muted">
              Done
            </button>
            <PrimaryButton type="button" onClick={() => { close(); onTrack(ref); }}>
              Track this application
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply.mutate(form);
          }}
        >
          <Field label="Full name" htmlFor="apply-name">
            <Input id="apply-name" autoComplete="name" required minLength={2} value={form.fullName} onChange={set("fullName")} placeholder="e.g. Grace Wanjiru" />
          </Field>
          <Field label="Phone number" htmlFor="apply-phone" hint="We'll text updates to this number.">
            <Input id="apply-phone" type="tel" inputMode="tel" autoComplete="tel" required value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="0712 345 678" />
          </Field>
          <Field label="Physical address" htmlFor="apply-address" hint="Plot number, street and area, plus a landmark if it helps.">
            <textarea
              id="apply-address"
              required
              minLength={5}
              rows={3}
              value={form.physicalAddress}
              onChange={set("physicalAddress")}
              placeholder="Plot 14, Kenyatta Rd, near St. Mary's school"
              className="w-full resize-none rounded-lg border border-input bg-card px-3.5 py-2.5 text-[15px] placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
            />
          </Field>
          <FormError>{apply.error ? errorMessage(apply.error) : null}</FormError>
          <PrimaryButton type="submit" loading={apply.isPending} className="w-full">
            {apply.isPending ? "Submitting…" : "Submit application"}
          </PrimaryButton>
        </form>
      )}
    </Modal>
  );
}

/* ---------------- Track modal ---------------- */

const STEPS = [
  { status: "PENDING_REVIEW", label: "Submitted", detail: "Under review by our team" },
  { status: "APPROVED_PENDING_PAYMENT", label: "Approved", detail: "Installation fee due" },
  { status: "PAID", label: "Fee paid", detail: "Scheduling your installation" },
  { status: "INSTALLED", label: "Connected", detail: "Meter installed, water on" },
] as const;

type TrackResult = NonNullable<ReturnType<typeof useTrackApplication>["data"]>;

function Timeline({ result }: { result: TrackResult }) {
  if (result.status === "REJECTED") {
    return (
      <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/6 p-4">
        <CircleX className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold text-foreground">Application not approved</p>
          <p className="mt-1 text-sm text-muted-foreground">{result.rejectionReason ?? "Contact our office for details."}</p>
        </div>
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.status === result.status);
  return (
    <ol className="space-y-0">
      {STEPS.map((s, i) => {
        const done = i < current || result.status === "INSTALLED";
        const active = i === current && result.status !== "INSTALLED";
        return (
          <li key={s.status} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < STEPS.length - 1 && (
              <span className={cn("absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5", done ? "bg-primary" : "bg-border")} aria-hidden />
            )}
            <span
              className={cn(
                "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-card ring-4 ring-primary/15",
                !done && !active && "border-border bg-card",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <div className="-mt-0.5">
              <p className={cn("text-sm font-semibold", !done && !active ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
              <p className="text-xs text-muted-foreground">
                {active && s.status === "APPROVED_PENDING_PAYMENT" && result.installationFeeKes != null
                  ? `Pay ${formatKES(result.installationFeeKes)} via M-Pesa to continue`
                  : s.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TrackModal({ open, onClose, track, value, setValue }: {
  open: boolean;
  onClose: () => void;
  track: ReturnType<typeof useTrackApplication>;
  value: string;
  setValue: (v: string) => void;
}) {
  const result = track.data;

  return (
    <Modal open={open} onClose={onClose} title="Track your application" description="Enter the reference number we gave you when you applied.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          track.mutate({ referenceNumber: value });
        }}
      >
        <label htmlFor="track-ref" className="sr-only">Reference number</label>
        <Input
          id="track-ref"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="REQ-0001"
          required
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-tight"
        />
        <PrimaryButton type="submit" loading={track.isPending} className="shrink-0">
          {!track.isPending && <Search className="size-4" />}
          Track
        </PrimaryButton>
      </form>

      <div className="mt-5">
        <FormError>{track.error ? errorMessage(track.error) : null}</FormError>
        {result && !track.isPending && (
          <div className="rise space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
              <div>
                <Code className="text-base text-primary">{result.referenceNumber}</Code>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {result.applicant} · submitted {formatDate(result.submittedAt)}
                </p>
              </div>
              <StatusBadge status={result.status} />
            </div>
            <Timeline result={result} />
            <p className="text-xs text-muted-foreground">Last updated {formatDate(result.updatedAt)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Page ---------------- */

function HeroPanel() {
  return (
    <div className="relative mx-auto w-full max-w-[440px]" aria-hidden>
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-primary/25 via-primary/5 to-transparent blur-2xl" />
      <div className="relative rounded-2xl border bg-card/90 p-6 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-primary">REQ-0042</span>
          <StatusBadge status="APPROVED_PENDING_PAYMENT" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Amina O. · Mwandi Estate, Plot 9</p>
        <div className="mt-6 space-y-3">
          {[
            { label: "Application submitted", done: true },
            { label: "Site survey approved", done: true },
            { label: "Installation fee · KES 6,500.00", done: false },
            { label: "Meter installed", done: false },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border-2",
                  s.done ? "border-primary bg-primary text-primary-foreground" : i === 2 ? "border-primary" : "border-border",
                )}
              >
                {s.done && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={cn("text-sm", s.done || i === 2 ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-primary/8 p-3.5">
          <Wallet className="size-5 text-primary" />
          <div className="text-xs">
            <p className="font-semibold text-foreground">Pay with M-Pesa</p>
            <p className="text-muted-foreground">Paybill <span className="font-mono text-foreground">522 533</span> · Acc <span className="font-mono text-foreground">REQ-0042</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

const HOW = [
  { Icon: ClipboardCheck, title: "Apply online", body: "Two minutes, no office visit. You get a REQ number on the spot." },
  { Icon: ShieldCheck, title: "Site review", body: "A surveyor checks the line and confirms your installation fee." },
  { Icon: Wallet, title: "Pay by M-Pesa", body: "Settle the fee from your phone — the status updates automatically." },
  { Icon: Wrench, title: "Get connected", body: "Our team installs the meter and your account goes live." },
];

export const Landing = function Landing() {
  const [applyOpen, setApplyOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackRef, setTrackRef] = useState("");
  const track = useTrackApplication();

  return (
    <div className="min-h-dvh bg-background">
      <Navbar />

      <main>
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(60%_50%_at_85%_10%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-20 pt-14 md:px-8 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:pb-28">
            <div className="rise">
              <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                <Droplets className="size-3.5 text-primary" /> Serving Mwandi and surrounding estates
              </p>
              <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-foreground md:text-[3.5rem]">
                Water Connection Services <span className="text-primary">Made Simple</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Apply for a new connection, follow every step from survey to meter installation, and manage your bills — all from your phone.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton type="button" onClick={() => setApplyOpen(true)} className="h-12 px-6 text-[15px]">
                  Apply for New Connection <ArrowRight className="size-4" />
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => {
                    setTrackOpen(true);
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border bg-card px-6 text-[15px] font-semibold text-foreground hover:bg-muted"
                >
                  <Search className="size-4" /> Track Application
                </button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Already a customer?{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Sign in with your phone or ACC number
                </Link>
              </p>
            </div>
            <div className="rise" style={{ "--i": 2 } as React.CSSProperties}>
              <HeroPanel />
            </div>
          </div>
        </section>

        <section className="border-t bg-card/50">
          <div className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">How it works</p>
            <h2 className="mt-2 max-w-lg text-2xl font-bold text-foreground md:text-3xl">From application to running water in four steps</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {HOW.map(({ Icon, title, body }, i) => (
                <div key={title} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <span className="flex items-center gap-2">
            <BrandMark className="size-5" /> © {new Date().getFullYear()} Mwandi Waters
          </span>
          <span className="flex items-center gap-1.5">
            <Phone className="size-3.5" /> Customer care <span className="font-mono text-foreground">0700 000 100</span>
          </span>
        </div>
      </footer>

      <ApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onTrack={(ref) => {
          setTrackRef(ref);
          track.mutate({ referenceNumber: ref });
          setTrackOpen(true);
        }}
      />
      <TrackModal open={trackOpen} onClose={() => setTrackOpen(false)} track={track} value={trackRef} setValue={setTrackRef} />
    </div>
  );
};

export default Landing;
