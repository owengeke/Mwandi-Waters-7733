import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleX,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "../components/app-shell";
import { Code } from "../components/code";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { Segmented } from "../components/segmented";
import { Button } from "../components/ui/button";
import { useOnboardingView, useSaveOnboardingStep } from "../queries/onboarding";
import { isPasswordValid, passwordStrength } from "../lib/password";
import { formatPhone } from "../lib/format";
import { normalizeOccupancy } from "../../api/lib/property";
import { cn } from "../lib/utils";
import type {
  ApplicationOnboardingView,
  ClientSetPasswordView,
  OnboardingStep,
} from "../../api/lib/onboarding";
import type { OccupantType, PropertyType } from "../../api/database/schema";

/* ---------------- constants + helpers ---------------- */

const SUPPORT_EMAIL = "hello@mwandiwaters.co.ke";
const HELP_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Help with my Mwandi Waters details",
)}`;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const compactPhone = (value: string) => value.trim().replace(/[\s\-().]/g, "");
const isValidPhone = (value: string) => /^(?:\+?254|0)[17]\d{8}$/.test(compactPhone(value));

type View = ApplicationOnboardingView | ClientSetPasswordView;

const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Details",
  2: "Property",
  3: "Consent",
  4: "Password",
};

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

const errorText = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";

/* ---------------- public chrome ---------------- */

function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1080px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="size-8 shrink-0" />
          <span className="truncate font-display text-[16px] font-bold tracking-tight text-foreground">
            Mwandi Waters
          </span>
        </Link>
        <a
          href={HELP_HREF}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/8 sm:px-3"
        >
          <HelpCircle className="size-4" aria-hidden />
          Need help?
        </a>
      </div>
    </header>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {children}
      </main>
    </div>
  );
}

function LinkProblem({ invalid, onRetry }: { invalid: boolean; onRetry?: () => void }) {
  return (
    <PageFrame>
      <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center sm:py-20">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <CircleX className="size-7" aria-hidden />
        </span>
        {invalid ? (
          <>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              This link is no longer valid
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Contact us for a new one.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Links expire after 7 days.
            </p>
            <a
              href={HELP_HREF}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Mail className="size-4" aria-hidden />
              Contact us
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              We couldn&apos;t open this page
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Check your connection and try again.
            </p>
            {onRetry && (
              <Button type="button" className="mt-6 h-11 px-5" onClick={onRetry}>
                Try again
              </Button>
            )}
          </>
        )}
      </div>
    </PageFrame>
  );
}

/* ---------------- progress ---------------- */

function Stepper({
  steps,
  current,
  completedSteps,
  onSelect,
}: {
  steps: OnboardingStep[];
  current: OnboardingStep;
  completedSteps: OnboardingStep[];
  onSelect: (step: OnboardingStep) => void;
}) {
  return (
    <nav aria-label="Your progress" className="mt-6">
      <ol className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {steps.map((step, index) => {
          const done = completedSteps.includes(step);
          const active = step === current;
          const canVisit = done || step <= current;

          const marker = (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors",
                active
                  ? "bg-[#7c3aed] text-white"
                  : done
                    ? "bg-[#0077b6] text-white dark:bg-primary dark:text-primary-foreground"
                    : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
              )}
              aria-hidden
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : step}
            </span>
          );

          const content = (
            <>
              <span className="flex items-center">
                {marker}
                {index < steps.length - 1 && (
                  <span
                    className={cn(
                      "ml-1.5 h-0.5 flex-1 rounded-full sm:ml-2",
                      done ? "bg-[#0077b6] dark:bg-primary" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
              </span>
              <span
                className={cn(
                  "mt-1.5 block truncate text-[11px] font-semibold sm:text-xs",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </>
          );

          return (
            <li key={step} className="min-w-0">
              {canVisit && !active ? (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                  aria-label={`Go to step ${step}: ${STEP_LABELS[step]}`}
                >
                  {content}
                </button>
              ) : (
                <div aria-current={active ? "step" : undefined}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------------- side panel ---------------- */

function SummaryPanel({
  view,
  steps,
  current,
  completedSteps,
}: {
  view: View;
  steps: OnboardingStep[];
  current: OnboardingStep;
  completedSteps: OnboardingStep[];
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {view.kind === "client" ? "Account number" : "Application reference"}
        </p>
        <p className="mt-1.5">
          <Code className="text-base text-primary">{view.referenceNumber}</Code>
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {view.feePaid ? "Installation fee paid" : "Installation fee not recorded"}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <h2 className="font-display text-base font-bold text-foreground">
          {view.kind === "client" ? "What's left" : "Your checklist"}
        </h2>
        <ol className="mt-3 space-y-2.5">
          {steps.map((step) => {
            const done = completedSteps.includes(step);
            const active = step === current && !done;
            return (
              <li key={step} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    done
                      ? "bg-success/12 text-success"
                      : active
                        ? "bg-[#7c3aed]/12 text-[#7c3aed]"
                        : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
                  )}
                  aria-hidden
                >
                  {done ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : view.kind === "client" ? (
                    <KeyRound className="size-3" />
                  ) : (
                    step
                  )}
                </span>
                <span
                  className={cn(
                    done
                      ? "text-muted-foreground line-through decoration-border"
                      : active
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {view.kind === "client" ? "Set your password" : STEP_LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        This page only ever shows what you saved here. Anything else,{" "}
        <a href={HELP_HREF} className="font-semibold text-primary hover:underline">
          contact us
        </a>
        .
      </p>
    </aside>
  );
}

/* ---------------- form state ---------------- */

interface FormState {
  fullName: string;
  email: string;
  phoneNumber: string;
  propertyType: PropertyType;
  occupantType: OccupantType;
  estate: string;
  plotOrHouseNo: string;
  landmark: string;
  landlordPhone: string;
  whatsappConsent: boolean;
  billingUseConsent: boolean;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phoneNumber: "",
  propertyType: "residential",
  occupantType: "owner",
  estate: "",
  plotOrHouseNo: "",
  landmark: "",
  landlordPhone: "",
  whatsappConsent: false,
  billingUseConsent: false,
  password: "",
  confirmPassword: "",
};

function initialForm(view: View): FormState {
  if (view.kind === "client") {
    return {
      ...EMPTY_FORM,
      fullName: view.details.fullName,
      email: view.details.email ?? "",
      phoneNumber: view.details.phoneNumber,
    };
  }

  const details = view.details;
  const occupancy = normalizeOccupancy(details);
  return {
    ...EMPTY_FORM,
    fullName: details.fullName,
    email: details.email ?? "",
    phoneNumber: details.phoneNumber,
    propertyType: occupancy.propertyType ?? "residential",
    occupantType: occupancy.occupantType ?? "owner",
    estate: details.estate ?? "",
    plotOrHouseNo: details.plotOrHouseNo ?? "",
    landmark: details.landmark ?? "",
    landlordPhone: occupancy.landlordPhone ?? "",
    whatsappConsent: details.whatsappConsent,
  };
}

/* ---------------- password strength ---------------- */

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = passwordStrength(password);
  const filled = strength.score;

  return (
    <output className="mt-2 block space-y-1.5" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              bar > filled
                ? "bg-muted"
                : strength.score >= 4
                  ? "bg-success"
                  : strength.score === 3
                    ? "bg-[#0077b6] dark:bg-primary"
                    : strength.score === 2
                      ? "bg-warning"
                      : "bg-destructive",
            )}
          />
        ))}
      </span>
      <span className="block text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{strength.label}.</span> {strength.hint}
      </span>
    </output>
  );
}

function PasswordInput({
  id,
  label,
  autoComplete,
  value,
  onChange,
  error,
  show,
  onToggle,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  show: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          invalid={Boolean(error)}
          className="pr-12"
          placeholder="At least 8 characters"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </Field>
  );
}

/* ---------------- completion ---------------- */

function CompletionScreen({ view, fullName }: { view: View; fullName: string }) {
  const firstName = fullName.trim().split(/\s+/)[0];
  const client = view.kind === "client";

  return (
    <PageFrame>
      <div className="mx-auto max-w-lg py-6 sm:py-12">
        <div className="rounded-2xl border bg-card p-6 text-center sm:p-9">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckCircle2 className="size-7" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {client ? "Your password is set" : "You're all set"}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            {client
              ? "Sign in with your phone number and the password you just chose."
              : "Your details are saved and your password is set. Sign in with your phone number and the password you just chose."}
          </p>

          <dl className="mt-6 divide-y rounded-xl border bg-muted/30 px-4 text-left text-sm">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted-foreground">
                {client ? "Account number" : "Application reference"}
              </dt>
              <dd>
                <Code>{view.referenceNumber}</Code>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted-foreground">Installation fee</dt>
              <dd className="font-semibold text-success">{view.feePaid ? "Paid" : "Not recorded"}</dd>
            </div>
          </dl>

          <Link
            to="/login"
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Sign in
            <ArrowRight className="size-4" aria-hidden />
          </Link>

          <p className="mt-4 flex items-start justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            For your security, we don&apos;t sign you in automatically.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Need to change something?{" "}
          <a href={HELP_HREF} className="font-semibold text-primary hover:underline">
            Contact us
          </a>
          .
        </p>
      </div>
    </PageFrame>
  );
}

/* ---------------- the flow ---------------- */

function OnboardingFlow({ token, view }: { token: string; view: View }) {
  const save = useSaveOnboardingStep();
  const [form, setForm] = useState<FormState>(() => initialForm(view));
  const [step, setStep] = useState<OnboardingStep>(view.currentStep);
  const [completed, setCompleted] = useState(view.completed);
  const [completedSteps, setCompletedSteps] = useState<OnboardingStep[]>(view.completedSteps);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const client = view.kind === "client";
  const steps = useMemo<OnboardingStep[]>(
    () => (client ? [4] : [1, 2, 3, 4]),
    [client],
  );

  const commercial = form.propertyType === "commercial";
  const tenant = commercial && form.occupantType === "tenant";
  const busy = save.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  function selectPropertyType(value: PropertyType) {
    set("propertyType", value);
    if (value === "residential") {
      set("occupantType", "owner");
      set("landlordPhone", "");
    }
  }

  function validate(current: OnboardingStep): Record<string, string> {
    const next: Record<string, string> = {};

    if (current === 1) {
      if (form.fullName.trim().length < 2) next.fullName = "Enter your full name.";
      if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
        next.email = "Enter a valid email address.";
      }
    }

    if (current === 2) {
      if (!form.estate.trim()) next.estate = "Enter the estate or area.";
      if (!form.plotOrHouseNo.trim()) next.plotOrHouseNo = "Enter the plot or house number.";
      if (!form.landmark.trim()) next.landmark = "Enter the nearest landmark.";
      if (tenant && form.landlordPhone.trim() && !isValidPhone(form.landlordPhone)) {
        next.landlordPhone = "Enter a valid Kenyan phone number.";
      }
    }

    if (current === 3) {
      if (!form.whatsappConsent) next.whatsappConsent = "Please agree to receive bills and receipts on WhatsApp.";
      if (!form.billingUseConsent) next.billingUseConsent = "Please agree to the use of your details for billing.";
    }

    if (current === 4) {
      if (!isPasswordValid(form.password)) next.password = "Use at least 8 characters.";
      if (form.password !== form.confirmPassword) next.confirmPassword = "Both passwords must match.";
    }

    return next;
  }

  function payload(current: OnboardingStep): Record<string, unknown> {
    if (current === 1) {
      return {
        fullName: form.fullName.trim(),
        email: form.email.trim() || "",
      };
    }

    if (current === 2) {
      const occupancy = normalizeOccupancy({
        propertyType: form.propertyType,
        occupantType: form.occupantType,
        landlordPhone: form.landlordPhone.trim() || null,
      });
      return {
        propertyType: occupancy.propertyType,
        occupantType: occupancy.occupantType ?? undefined,
        estate: form.estate.trim(),
        plotOrHouseNo: form.plotOrHouseNo.trim(),
        landmark: form.landmark.trim(),
        landlordPhone: occupancy.landlordPhone ?? undefined,
      };
    }

    if (current === 3) {
      return {
        whatsappConsent: form.whatsappConsent,
        billingUseConsent: form.billingUseConsent,
      };
    }

    return { password: form.password };
  }

  function goTo(next: OnboardingStep) {
    if (next === step) return;
    const canVisit = completedSteps.includes(next) || next <= step;
    if (!canVisit) return;
    setStep(next);
    setErrors({});
    setServerError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setServerError(null);
    const next = validate(step);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      const result = await save.mutateAsync({ token, step, data: payload(step) });
      setCompletedSteps(
        [...result.completedSteps].sort((a, b) => a - b) as OnboardingStep[],
      );

      if (result.completed || step === 4) {
        setCompleted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const nextStep = (result.currentStep ?? step + 1) as OnboardingStep;
      setStep(nextStep);
      setErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (errorCode(error) === "NOT_FOUND") {
        setInvalid(true);
        return;
      }
      setServerError(errorText(error));
    }
  }

  if (invalid) return <LinkProblem invalid />;
  if (completed) return <CompletionScreen view={view} fullName={form.fullName} />;

  const title = client
    ? "Choose a password"
    : step === 1
      ? "Your details"
      : step === 2
        ? "Your property"
        : step === 3
          ? "Stay in touch"
          : "Create a password";

  const subtitle = client
    ? "Choose a password for your Mwandi Waters account."
    : step === 1
      ? "Confirm who this account belongs to."
      : step === 2
        ? "Tell us where the water is supplied."
        : step === 3
          ? "How we may contact you about your account."
          : "You'll use this to sign in and view your bills.";

  return (
    <PageFrame>
      <div className="mx-auto max-w-[720px] lg:max-w-none">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Mwandi Waters · {client ? "Account access" : "New connection"}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {client ? "Set your password" : "Complete your details"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {client
            ? "Choose a password, then sign in with your phone number."
            : "This takes about 3 minutes. Your answers save at every step, so you can close this page and come back with the same link."}
        </p>

        {!client && (
          <Stepper
            steps={steps}
            current={step}
            completedSteps={completedSteps}
            onSelect={goTo}
          />
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border bg-card p-5 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {client ? "Final step" : `Step ${step} of 4`}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
              {step === 1 && (
                <>
                  <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
                    <Input
                      id="fullName"
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      placeholder="As on your ID or application"
                      invalid={Boolean(errors.fullName)}
                      disabled={busy}
                    />
                  </Field>

                  <Field
                    label="Phone number"
                    htmlFor="phoneNumber"
                    hint="This is the number from your application. Contact us if it is wrong."
                  >
                    <Input
                      id="phoneNumber"
                      type="tel"
                      autoComplete="tel"
                      value={formatPhone(form.phoneNumber)}
                      readOnly
                      className="bg-muted/50"
                    />
                  </Field>

                  <Field
                    label="Email (optional)"
                    htmlFor="email"
                    error={errors.email}
                    hint={errors.email ? undefined : "We use it only for account notices."}
                  >
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="name@example.com"
                      invalid={Boolean(errors.email)}
                      disabled={busy}
                    />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div className={cn("grid gap-4", commercial && "sm:grid-cols-2")}>
                    <Field
                      label="Property type"
                      htmlFor="propertyType"
                      hint={commercial ? undefined : "Residential properties are owner-occupied."}
                    >
                      <Segmented
                        label="Property type"
                        value={form.propertyType}
                        onChange={selectPropertyType}
                        disabled={busy}
                        options={[
                          { value: "residential", label: "Residential" },
                          { value: "commercial", label: "Commercial" },
                        ]}
                      />
                    </Field>
                    {commercial && (
                      <Field label="Occupant" htmlFor="occupantType">
                        <Segmented
                          label="Occupant"
                          value={form.occupantType}
                          onChange={(value) => set("occupantType", value)}
                          disabled={busy}
                          options={[
                            { value: "owner", label: "Owner" },
                            { value: "tenant", label: "Tenant" },
                          ]}
                        />
                      </Field>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Estate or area" htmlFor="estate" error={errors.estate}>
                      <Input
                        id="estate"
                        autoComplete="address-level2"
                        value={form.estate}
                        onChange={(e) => set("estate", e.target.value)}
                        placeholder="e.g. Kahawa Sukari"
                        invalid={Boolean(errors.estate)}
                        disabled={busy}
                      />
                    </Field>
                    <Field
                      label="Plot or house number"
                      htmlFor="plotOrHouseNo"
                      error={errors.plotOrHouseNo}
                    >
                      <Input
                        id="plotOrHouseNo"
                        autoComplete="address-line1"
                        value={form.plotOrHouseNo}
                        onChange={(e) => set("plotOrHouseNo", e.target.value)}
                        placeholder="e.g. Plot 9"
                        invalid={Boolean(errors.plotOrHouseNo)}
                        disabled={busy}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Nearest landmark"
                    htmlFor="landmark"
                    error={errors.landmark}
                    hint={errors.landmark ? undefined : "Helps the technician find the property."}
                  >
                    <Input
                      id="landmark"
                      autoComplete="off"
                      value={form.landmark}
                      onChange={(e) => set("landmark", e.target.value)}
                      placeholder="e.g. Near the shopping centre"
                      invalid={Boolean(errors.landmark)}
                      disabled={busy}
                    />
                  </Field>

                  {tenant && (
                    <Field
                      label="Landlord's phone number (optional)"
                      htmlFor="landlordPhone"
                      error={errors.landlordPhone}
                      hint={errors.landlordPhone ? undefined : "Only used if we cannot reach you."}
                    >
                      <Input
                        id="landlordPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={form.landlordPhone}
                        onChange={(e) => set("landlordPhone", e.target.value)}
                        placeholder="0712 345 678"
                        invalid={Boolean(errors.landlordPhone)}
                        disabled={busy}
                      />
                    </Field>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors hover:bg-muted/40">
                      <input
                        type="checkbox"
                        aria-label="Receive bills and receipts on WhatsApp"
                        checked={form.whatsappConsent}
                        onChange={(e) => set("whatsappConsent", e.target.checked)}
                        disabled={busy}
                        className="mt-0.5 size-5 shrink-0 rounded border-input accent-[#0077b6]"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-foreground">
                          Bills and receipts on WhatsApp
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          We send your monthly bill, payment reminders and receipts to your WhatsApp number.
                        </span>
                      </span>
                    </label>
                    {errors.whatsappConsent && (
                      <p className="text-xs font-medium text-destructive">{errors.whatsappConsent}</p>
                    )}

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors hover:bg-muted/40">
                      <input
                        type="checkbox"
                        aria-label="Agree to the use of my details for billing"
                        checked={form.billingUseConsent}
                        onChange={(e) => set("billingUseConsent", e.target.checked)}
                        disabled={busy}
                        className="mt-0.5 size-5 shrink-0 rounded border-input accent-[#0077b6]"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-foreground">
                          Use my details for billing
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          We use your name, phone number and property details to manage your water account.
                        </span>
                      </span>
                    </label>
                    {errors.billingUseConsent && (
                      <p className="text-xs font-medium text-destructive">{errors.billingUseConsent}</p>
                    )}
                  </div>

                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <ShieldCheck className="size-4 text-primary" aria-hidden />
                      How we look after your details
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      We use your details only to run your water account, send bills and receipts, and plan
                      your installation. We never sell your data. You can ask us to correct or delete it at
                      any time.
                    </p>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <PasswordInput
                    id="password"
                    label="Password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(value) => set("password", value)}
                    error={errors.password}
                    show={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    hint="Use at least 8 characters. A phrase you'll remember is stronger than a short word."
                  />
                  <StrengthMeter password={form.password} />

                  <PasswordInput
                    id="confirmPassword"
                    label="Confirm password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(value) => set("confirmPassword", value)}
                    error={errors.confirmPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                  />

                  <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    We store only a secure hash of your password, never the password itself. You&apos;ll sign
                    in with your phone number and this password.
                  </p>
                </>
              )}

              {serverError && <FormError>{serverError}</FormError>}

              <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                {!client && step > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 justify-center px-4 sm:justify-start"
                    onClick={() => goTo((step - 1) as OnboardingStep)}
                    disabled={busy}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <PrimaryButton
                  type="submit"
                  loading={busy}
                  className="h-11 w-full sm:w-auto"
                >
                  {step === 4 ? "Finish" : "Save and continue"}
                  {!busy && <ArrowRight className="size-4" aria-hidden />}
                </PrimaryButton>
              </div>

              <p className="text-center text-xs text-muted-foreground sm:text-left">
                {client
                  ? "We never see or display your password."
                  : "Your progress is saved at every step."}
              </p>
            </form>
          </section>

          <SummaryPanel
            view={view}
            steps={steps}
            current={step}
            completedSteps={completedSteps}
          />
        </div>
      </div>
    </PageFrame>
  );
}

/* ---------------- page ---------------- */

function LoadingPage() {
  return (
    <PageFrame>
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        Loading your details…
      </div>
    </PageFrame>
  );
}

export default function CompletePage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const query = useOnboardingView(token);

  if (!token) return <LinkProblem invalid />;
  if (query.isLoading) return <LoadingPage />;

  if (query.error || !query.data) {
    const code = errorCode(query.error);
    if (code === "TOO_MANY_REQUESTS") {
      return (
        <PageFrame>
          <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center sm:py-20">
            <span className="flex size-14 items-center justify-center rounded-full bg-warning/12 text-warning">
              <CircleX className="size-7" aria-hidden />
            </span>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Please wait a moment
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {errorText(query.error)}
            </p>
            <Button type="button" className="mt-6 h-11 px-5" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        </PageFrame>
      );
    }

    if (code === "NOT_FOUND" || !query.error) return <LinkProblem invalid />;
    return <LinkProblem invalid={false} onRetry={() => void query.refetch()} />;
  }

  return <OnboardingFlow token={token} view={query.data} />;
}
