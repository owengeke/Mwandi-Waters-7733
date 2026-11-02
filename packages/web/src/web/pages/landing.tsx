import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, CircleX, Search } from "lucide-react";
import { BrandMark } from "../components/app-shell";
import { ThemeToggle } from "../components/theme-switcher";
import { Modal } from "../components/modal";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { StatusBadge } from "../components/status-badge";
import { useApplyConnection, useMe, useTrackApplication } from "../queries/portal";
import { formatKES } from "../lib/format";
import { cn } from "../lib/utils";

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

/* ---------------- Navbar ---------------- */

function Navbar({ onTrack }: { onTrack: () => void }) {
  const me = useMe();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-2 px-5 md:px-8 sm:gap-4">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="whitespace-nowrap font-display text-[16px] font-bold tracking-tight text-foreground sm:text-[17px]">
            Mwandi Waters
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex" aria-label="Site">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <Link to="/login" className="transition-colors hover:text-foreground">
            Pay your bill
          </Link>
          <button type="button" onClick={onTrack} className="transition-colors hover:text-foreground">
            Track application
          </button>
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <ThemeToggle className="size-11" />
          {me.data ? (
            <Link
              to={me.data.home}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4 sm:text-sm"
            >
              Dashboard <ArrowRight className="hidden size-3.5 sm:block" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex h-11 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-5 sm:text-sm"
            >
              Sign in
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
            <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-primary">{ref}</p>
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
            <Input id="apply-name" autoComplete="name" required minLength={2} value={form.fullName} onChange={set("fullName")} placeholder="e.g. Jane Doe" />
          </Field>
          <Field label="Phone number" htmlFor="apply-phone" hint="We'll text updates to this number.">
            <Input id="apply-phone" type="tel" inputMode="tel" autoComplete="tel" required value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="0712 000 000" />
          </Field>
          <Field label="Physical address" htmlFor="apply-address" hint="Plot number, street and area, plus a landmark if it helps.">
            <textarea
              id="apply-address"
              aria-label="Physical address"
              required
              minLength={5}
              rows={3}
              value={form.physicalAddress}
              onChange={set("physicalAddress")}
              placeholder="e.g. Plot 12, Market Road, near the shopping centre"
              className="w-full resize-none rounded-lg border border-input bg-card px-3.5 py-2.5 text-[15px] placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
            />
          </Field>
          <FormError>{apply.error ? errorMessage(apply.error) : null}</FormError>
          <PrimaryButton type="submit" loading={apply.isPending} className="w-full">
            {apply.isPending ? "Submitting..." : "Submit application"}
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
          <p className="mt-1 text-sm text-muted-foreground">Contact our office for details.</p>
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
          className="tracking-tight"
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
                <span className="text-base font-semibold text-primary">{result.referenceNumber}</span>
                <p className="mt-0.5 text-sm text-muted-foreground">Application status</p>
              </div>
              <StatusBadge status={result.status} />
            </div>
            <Timeline result={result} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Hero ---------------- */

const HERO_STEPS = [
  { label: "Application submitted", done: true, current: false, detail: null },
  { label: "Site survey approved", done: true, current: false, detail: null },
  { label: "Installation fee", done: false, current: true, detail: "KES 6,500.00 due" },
  { label: "Meter installed", done: false, current: false, detail: null },
] as const;

function HeroPanel() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(130%,640px)] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="absolute inset-[6%] rounded-full border border-primary/12" />
        <div className="absolute inset-[19%] rounded-full border border-primary/12" />
        <div className="absolute inset-[32%] rounded-full border border-primary/12" />
      </div>

      <figure className="relative">
        <div className="rounded-2xl border bg-card p-6 shadow-[0_24px_70px_-40px_rgba(11,27,46,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-[17px] font-bold tracking-tight text-foreground">
              Application REQ-0042
            </p>
            <span className="shrink-0 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[11px] font-semibold text-[#b45309] dark:bg-amber-500/15 dark:text-amber-300">
              Awaiting payment
            </span>
          </div>

          <ol className="mt-6">
            {HERO_STEPS.map((step, i) => (
              <li key={step.label} className="relative flex gap-3.5 pb-5 last:pb-0">
                {i < HERO_STEPS.length - 1 && (
                  <span
                    className={cn(
                      "absolute left-[10px] top-6 h-[calc(100%-1.25rem)] w-0.5",
                      i < 2 ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 bg-card",
                    step.done && "border-primary bg-primary text-primary-foreground",
                    !step.done && step.current && "border-primary",
                    !step.done && !step.current && "border-border",
                  )}
                >
                  {step.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <div className="-mt-0.5">
                  <p
                    className={cn(
                      "text-[15px] font-semibold",
                      step.done || step.current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                  {step.detail && <p className="text-sm text-muted-foreground">{step.detail}</p>}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl bg-[#eaf5fc] px-4 py-3.5 dark:bg-primary/10">
            <p className="font-semibold text-foreground">Pay with M-Pesa</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Paybill <span className="font-semibold text-foreground">522 533</span>, account number{" "}
              <span className="font-semibold text-foreground">REQ-0042</span>
            </p>
          </div>
        </div>
        <figcaption className="mt-4 text-center text-sm text-muted-foreground">
          An example of what you see when you track an application.
        </figcaption>
      </figure>
    </div>
  );
}

const FACTS = [
  {
    title: "One flat rate",
    body: "KES 150 per unit. No tiers and no surprises on your bill.",
  },
  {
    title: "Pay by M-Pesa",
    body: "Use Paybill 522 533 with your account number, or pay online.",
  },
  {
    title: "Bills on WhatsApp",
    body: "Get every invoice and receipt on your phone as soon as it is issued.",
  },
];

const HOW = [
  { title: "Apply online", body: "Tell us who you are and where the property is." },
  { title: "Site survey", body: "Our team visits and approves the connection." },
  { title: "Pay the fee", body: "Pay the installation fee by M-Pesa Paybill." },
  { title: "Meter installed", body: "You get your account number and can sign in." },
];

/* ---------------- Page ---------------- */

export const Landing = function Landing() {
  const [applyOpen, setApplyOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackRef, setTrackRef] = useState("");
  const track = useTrackApplication();

  const openTrack = () => setTrackOpen(true);

  return (
    <div className="min-h-dvh bg-background">
      <Navbar onTrack={openTrack} />

      <main>
        <section className="relative overflow-hidden">
          <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-14 pt-12 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-20 lg:pt-16">
            <div className="rise">
              <h1 className="font-display text-[2.2rem] font-bold leading-[1.04] tracking-tight text-foreground sm:text-[2.8rem] lg:text-[3.5rem]">
                Water Connection Services <span className="text-primary">Made Simple</span>
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
                Apply for a new connection, follow every step from survey to meter installation, and manage your bills from your phone.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setApplyOpen(true)}
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  Apply for New Connection
                </button>
                <button
                  type="button"
                  onClick={openTrack}
                  className="inline-flex h-12 items-center justify-center rounded-lg border bg-card px-6 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Track Application
                </button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Already a customer?{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Sign in with your phone or account number
                </Link>
              </p>
            </div>
            <div className="rise" style={{ "--i": 2 } as React.CSSProperties}>
              <HeroPanel />
            </div>
          </div>
        </section>

        <section id="pay-your-bill" className="mx-auto max-w-[1280px] scroll-mt-24 px-5 md:px-8">
          <div className="grid divide-y rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {FACTS.map((fact) => (
              <div key={fact.title} className="p-6">
                <h2 className="font-display text-[17px] font-bold text-foreground">{fact.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{fact.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1280px] scroll-mt-24 px-5 pt-16 md:px-8 md:pt-20">
          <h2 className="font-display text-[1.75rem] font-bold tracking-tight text-foreground md:text-[2rem]">
            How a new connection works
          </h2>
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {HOW.map((step, i) => (
              <div key={step.title} className="border-t-2 border-primary pt-4">
                <p className="text-sm font-semibold text-primary">{i + 1}</p>
                <h3 className="mt-1 font-display text-[17px] font-bold text-foreground">{step.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 bg-[#0b1b2e] py-14 md:mt-20">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 className="font-display text-[1.75rem] font-bold tracking-tight text-white md:text-[2rem]">
                Ready to get connected?
              </h2>
              <p className="mt-2 text-[15px] text-white/75">
                Apply in a few minutes. We will keep you updated on WhatsApp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setApplyOpen(true)}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-[#38bdf8] px-6 text-[15px] font-semibold text-[#062033] transition-colors hover:bg-[#7dd3fc]"
            >
              Apply for New Connection
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <span>Mwandi Waters. Clean &amp; Reliable Water Services.</span>
          <span>Serving Mwandi and surrounding estates.</span>
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