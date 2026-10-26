import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, MessageSquareText, RotateCw } from "lucide-react";
import { BrandMark } from "../components/app-shell";
import { ThemeToggle } from "../components/theme-switcher";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { FullScreenLoader } from "../components/route-guard";
import { portalAuth, type OtpSendResult } from "../lib/auth";
import { orpc } from "../lib/api";
import { canAccess, HOME_FOR_ROLE, type Role } from "../lib/roles";
import { useMe } from "../queries/portal";
import { cn } from "../lib/utils";

type Method = "password" | "otp";

function destinationFor(role: Role, next: string | null) {
  return next && canAccess(role, next) ? next : HOME_FOR_ROLE[role];
}

function MethodToggle({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  const opts: { v: Method; label: string; Icon: typeof KeyRound }[] = [
    { v: "password", label: "Password", Icon: KeyRound },
    { v: "otp", label: "One-time code", Icon: MessageSquareText },
  ];
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-white/40 bg-white/40 p-1 dark:border-white/10 dark:bg-white/5">
      <legend className="sr-only">Sign-in method</legend>
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            value === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

export const Login = function Login() {
  const me = useMe();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const next = new URLSearchParams(useSearch()).get("next");

  const [method, setMethod] = useState<Method>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState<OtpSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "signin" | "send" | "verify">(null);
  const [cooldown, setCooldown] = useCountdown();
  const codeRef = useRef<HTMLInputElement>(null);

  if (me.isLoading) return <FullScreenLoader label="Checking your session…" />;
  if (me.data && !busy) return <Redirect to={destinationFor(me.data.role, next)} replace />;

  async function finish() {
    const user = await qc.fetchQuery({ ...orpc.portal.me.queryOptions(), staleTime: 0 });
    if (!user) throw new Error("Signed in, but the session could not be loaded. Please try again.");
    navigate(destinationFor(user.role, next), { replace: true });
  }

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const sendCode = () =>
    run("send", async () => {
      const res = await portalAuth.sendOtp(identifier);
      setOtp(res);
      setCode("");
      setCooldown(30);
      setTimeout(() => codeRef.current?.focus(), 50);
    });

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError(null);
    setOtp(null);
    setCode("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === "password") {
      run("signin", async () => {
        await portalAuth.signInWithPassword(identifier, password);
        await finish();
      });
    } else if (!otp) {
      sendCode();
    } else {
      run("verify", async () => {
        await portalAuth.verifyOtp(identifier, code);
        await finish();
      });
    }
  };

  const otpStage = method === "otp" && otp;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#E6F2FA] dark:bg-[#0B132B]">
      {/* Layered water background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-40 -top-40 size-[560px] rounded-full bg-[#0077B6]/35 blur-[110px] dark:bg-[#0077B6]/45" />
        <div className="absolute -bottom-48 -right-32 size-[620px] rounded-full bg-[#48CAE4]/40 blur-[120px] dark:bg-[#3BA4E0]/25" />
        <div className="absolute left-1/2 top-1/3 size-[380px] -translate-x-1/2 rounded-full bg-white/50 blur-[100px] dark:bg-[#1E293B]/80" />
        <svg className="absolute inset-x-0 bottom-0 w-full text-[#0077B6]/10 dark:text-[#3BA4E0]/10" viewBox="0 0 1440 240" preserveAspectRatio="none">
          <path fill="currentColor" d="M0 120c120-40 240-40 360 0s240 40 360 0 240-40 360 0 240 40 360 0v120H0z" />
          <path fill="currentColor" d="M0 170c120-30 240-30 360 0s240 30 360 0 240-30 360 0 240 30 360 0v70H0z" />
        </svg>
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-5 md:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="font-display text-[17px] font-bold tracking-tight text-foreground">Mwandi Waters</span>
        </Link>
        <ThemeToggle className="border-white/50 bg-white/50 backdrop-blur dark:border-white/10 dark:bg-white/5" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-16 pt-4">
        <div className="rise w-full max-w-[420px] rounded-3xl border border-white/60 bg-white/55 p-7 shadow-[0_20px_60px_-20px_rgba(0,58,92,0.35)] backdrop-blur-2xl sm:p-9 dark:border-white/10 dark:bg-[#1E293B]/55 dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
          <h1 className="font-display text-2xl font-bold text-foreground">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Customers, staff and administrators — one sign-in for everyone.</p>

          <div className="mt-6">
            <MethodToggle value={method} onChange={switchMethod} />
          </div>

          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <Field label="Phone, account number or email" htmlFor="identifier" hint={otpStage ? undefined : "e.g. 0712 345 678, ACC-0001 or you@example.com"}>
              <Input
                id="identifier"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={identifier}
                disabled={!!otpStage}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="0712 345 678"
                className="bg-white/70 dark:bg-[#0B132B]/60"
              />
            </Field>

            {method === "password" && (
              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/70 dark:bg-[#0B132B]/60"
                />
              </Field>
            )}

            {otpStage && (
              <div className="rise space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/8 px-3.5 py-3 text-sm">
                  {otp.destination ? (
                    <p className="text-foreground">
                      We sent a 6-digit code to <span className="font-mono font-semibold">{otp.destination}</span>
                      {otp.channel === "whatsapp"
                        ? " on WhatsApp"
                        : otp.channel === "sms"
                          ? " by SMS"
                          : ""}
                      . It expires in {Math.round(otp.expiresIn / 60)} minutes.
                    </p>
                  ) : (
                    <p className="text-foreground">If that account exists, a 6-digit code is on its way to the registered phone.</p>
                  )}
                  {otp.devCode && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Dev mode, no delivery channel configured. Code: <span className="font-mono font-semibold text-foreground">{otp.devCode}</span>
                    </p>
                  )}
                </div>
                <Field label="Verification code" htmlFor="code">
                  <Input
                    id="code"
                    ref={codeRef}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="bg-white/70 text-center font-mono text-xl tracking-[0.5em] dark:bg-[#0B132B]/60"
                  />
                </Field>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => switchMethod("otp")}
                    className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" /> Change
                  </button>
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={cooldown > 0 || busy !== null}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    <RotateCw className={cn("size-3.5", busy === "send" && "animate-spin")} />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>
              </div>
            )}

            <FormError>{error}</FormError>

            <PrimaryButton
              type="submit"
              className="w-full"
              loading={busy !== null && busy !== (otpStage ? "send" : null)}
              disabled={
                !identifier.trim() ||
                (method === "password" && !password) ||
                (!!otpStage && code.length !== 6)
              }
            >
              {method === "password"
                ? busy === "signin" ? "Signing in…" : "Sign in"
                : !otpStage
                  ? busy === "send" ? "Sending code…" : "Send code"
                  : busy === "verify" ? "Verifying…" : "Verify and sign in"}
            </PrimaryButton>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            New customer?{" "}
            <Link to="/" className="font-semibold text-primary hover:underline">
              Apply for a connection
            </Link>{" "}
            — then sign in with a code sent to your phone once connected.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
