import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { CheckCircle2, Info, MessageCircle, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { Segmented } from "../components/segmented";
import { Button } from "../components/ui/button";
import { Code } from "../components/code";
import { useToast } from "../components/toast";
import {
  useClientDrafts,
  useCreateClient,
  useDuplicateCheck,
  usePreviewAccountNumber,
  useSaveClientDraft,
} from "../queries/clients";
import { cn } from "../lib/utils";
import { normalizeOccupancy } from "../../api/lib/property";
import type { OccupantType, PropertyType } from "../../api/database/schema";

/* ---------------- helpers ---------------- */

const METER_PATTERN = /^MTR-\d{4,}$/;

const compactPhone = (value: string) => value.trim().replace(/[\s\-().]/g, "");
const isValidPhone = (value: string) => /^(?:\+?254|0)[17]\d{8}$/.test(compactPhone(value));

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type FormState = {
  fullName: string;
  phoneNumber: string;
  email: string;
  propertyType: PropertyType;
  occupantType: OccupantType;
  estate: string;
  plotOrHouseNo: string;
  landmark: string;
  landlordPhone: string;
  meterNumber: string;
  openingReading: string;
};

const EMPTY: FormState = {
  fullName: "",
  phoneNumber: "",
  email: "",
  propertyType: "residential",
  occupantType: "owner",
  estate: "",
  plotOrHouseNo: "",
  landmark: "",
  landlordPhone: "",
  meterNumber: "",
  openingReading: "0",
};

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";

/* ---------------- small pieces ---------------- */

const TONE = {
  blue: "bg-[#0077b6] dark:bg-primary",
  violet: "bg-[#7c3aed]",
  orange: "bg-[#ea580c]",
} as const;

function FormCard({
  step,
  tone,
  title,
  subtitle,
  children,
}: {
  step: number;
  tone: keyof typeof TONE;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white",
            TONE[tone],
          )}
          aria-hidden
        >
          {step}
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function NextStep({
  tone,
  step,
  title,
  children,
}: {
  tone: keyof typeof TONE;
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
          TONE[tone],
        )}
        aria-hidden
      >
        {step}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

/* ---------------- page ---------------- */

export default function ClientNewPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const toast = useToast();

  const draftId = useMemo(() => {
    const raw = new URLSearchParams(search).get("draft");
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [search]);

  const drafts = useClientDrafts();
  const draft = useMemo(
    () => drafts.data?.find((row) => row.id === draftId) ?? null,
    [drafts.data, draftId],
  );

  const preview = usePreviewAccountNumber();
  const create = useCreateClient();
  const saveDraft = useSaveClientDraft();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [sendLink, setSendLink] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const appliedDraft = useRef<number | null>(null);

  const busy = create.isPending || saveDraft.isPending;

  // Prefill once when continuing a saved draft.
  useEffect(() => {
    if (!draft || appliedDraft.current === draft.id) return;
    appliedDraft.current = draft.id;
    const occupancy = normalizeOccupancy({
      propertyType: (draft.propertyType as PropertyType) ?? null,
      occupantType: (draft.occupantType as OccupantType) ?? null,
      landlordPhone: draft.landlordPhone ?? null,
    });
    setForm({
      fullName: draft.fullName ?? "",
      phoneNumber: draft.phoneNumber ?? "",
      email: draft.email ?? "",
      propertyType: occupancy.propertyType ?? "residential",
      occupantType: occupancy.occupantType ?? "owner",
      estate: draft.estate ?? "",
      plotOrHouseNo: draft.plotOrHouseNo ?? "",
      landmark: draft.landmark ?? "",
      landlordPhone: occupancy.landlordPhone ?? "",
      meterNumber: draft.meterNumber?.startsWith("PENDING-") ? "" : (draft.meterNumber ?? ""),
      openingReading: "0",
    });
  }, [draft]);

  /** Residential is owner-occupied; switching to it clears the occupant choice. */
  function selectPropertyType(value: PropertyType) {
    set("propertyType", value);
    if (value === "residential") {
      set("occupantType", "owner");
      set("landlordPhone", "");
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  // Duplicate check runs only once the typed number is complete and valid.
  const [checkPhone, setCheckPhone] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCheckPhone(isValidPhone(form.phoneNumber) ? form.phoneNumber.trim() : null);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [form.phoneNumber]);

  const duplicate = useDuplicateCheck(checkPhone);
  const isDuplicate = Boolean(duplicate.data?.duplicate);
  // The occupant choice only applies to commercial premises.
  const commercial = form.propertyType === "commercial";
  const tenant = commercial && form.occupantType === "tenant";

  function validate(requireMeter: boolean) {
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 2) next.fullName = "Enter the client's full name.";
    if (!isValidPhone(form.phoneNumber)) next.phoneNumber = "Enter a Kenyan phone number, e.g. 0712 345 678.";
    if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (tenant && form.landlordPhone.trim() && !isValidPhone(form.landlordPhone)) {
      next.landlordPhone = "Enter a valid Kenyan phone number.";
    }
    if (form.meterNumber.trim() && !METER_PATTERN.test(form.meterNumber.trim().toUpperCase())) {
      next.meterNumber = "Meter numbers look like MTR-0001.";
    }
    if (requireMeter) {
      const opening = Number(form.openingReading);
      if (!form.openingReading.trim() || !Number.isFinite(opening) || opening < 0) {
        next.openingReading = "Enter the reading on the meter (0 if it starts at zero).";
      } else if (Math.abs(opening * 100 - Math.round(opening * 100)) > 1e-6) {
        next.openingReading = "Use at most 2 decimal places.";
      }
    }
    return next;
  }

  function basePayload() {
    // Send whatever the visible fields imply — the server applies the same rule.
    const occupancy = normalizeOccupancy({
      propertyType: form.propertyType,
      occupantType: form.occupantType,
      landlordPhone: form.landlordPhone.trim() || null,
    });
    return {
      fullName: form.fullName.trim(),
      phoneNumber: form.phoneNumber.trim(),
      email: form.email.trim() || undefined,
      propertyType: occupancy.propertyType ?? undefined,
      occupantType: occupancy.occupantType ?? undefined,
      estate: form.estate.trim() || undefined,
      plotOrHouseNo: form.plotOrHouseNo.trim() || undefined,
      landmark: form.landmark.trim() || undefined,
      landlordPhone: occupancy.landlordPhone ?? undefined,
      meterNumber: form.meterNumber.trim().toUpperCase() || undefined,
    };
  }

  async function handleCreate() {
    if (busyRef.current || busy) return;
    setServerError(null);
    const next = validate(true);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (isDuplicate) {
      setServerError("This phone number already has an account. Use the existing client instead.");
      return;
    }

    busyRef.current = true;
    try {
      const row = await create.mutateAsync({
        ...basePayload(),
        openingReading: Number(form.openingReading),
        sendWhatsappLink: sendLink,
        createdVia: "walk_in",
        draftId: draft?.id,
      });
      toast({
        title: "Client created",
        description: `${row.fullName} · ${row.accountNumber}`,
      });
      navigate(`/clients/${row.id}`);
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      busyRef.current = false;
    }
  }

  async function handleSaveDraft() {
    if (busyRef.current || busy) return;
    setServerError(null);
    const next = validate(false);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    busyRef.current = true;
    try {
      await saveDraft.mutateAsync({ ...basePayload(), draftId: draft?.id });
      toast({ title: draft ? "Draft updated" : "Draft saved", description: "Find it on the Drafts tab." });
      navigate("/clients?tab=drafts");
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <>
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/clients" className="hover:text-foreground">
          Clients
        </Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-foreground">{draft ? "Edit draft" : "Add client"}</span>
      </nav>

      <PageHeader
        title={draft ? "Edit draft" : "Add a client"}
        description="For walk-in customers and existing connections. People who apply online are added automatically after their meter is installed."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <FormCard step={1} tone="blue" title="Client details" subtitle="Who the account belongs to">
            <div className="space-y-4">
              <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
                <Input
                  id="fullName"
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="As on their ID or application"
                  invalid={Boolean(errors.fullName)}
                  disabled={busy}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Phone number (WhatsApp)"
                  htmlFor="phoneNumber"
                  error={errors.phoneNumber}
                  hint={errors.phoneNumber ? undefined : "Bills and receipts are sent here."}
                >
                  <Input
                    id="phoneNumber"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phoneNumber}
                    onChange={(e) => set("phoneNumber", e.target.value)}
                    placeholder="0712 345 678"
                    invalid={Boolean(errors.phoneNumber)}
                    disabled={busy}
                  />
                </Field>
                <Field label="Email (optional)" htmlFor="email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="name@example.com"
                    invalid={Boolean(errors.email)}
                    disabled={busy}
                  />
                </Field>
              </div>
            </div>
          </FormCard>

          <FormCard step={2} tone="violet" title="Property" subtitle="Where the water is supplied">
            <div className="space-y-4">
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
                <Field label="Estate or area" htmlFor="estate">
                  <Input
                    id="estate"
                    value={form.estate}
                    onChange={(e) => set("estate", e.target.value)}
                    placeholder="Estate or area"
                    disabled={busy}
                  />
                </Field>
                <Field label="Plot or house number" htmlFor="plotOrHouseNo">
                  <Input
                    id="plotOrHouseNo"
                    value={form.plotOrHouseNo}
                    onChange={(e) => set("plotOrHouseNo", e.target.value)}
                    placeholder="e.g. Plot 9"
                    disabled={busy}
                  />
                </Field>
              </div>
              <Field label="Nearest landmark" htmlFor="landmark">
                <Input
                  id="landmark"
                  value={form.landmark}
                  onChange={(e) => set("landmark", e.target.value)}
                  placeholder="Helps the technician find the property"
                  disabled={busy}
                />
              </Field>
              {tenant && (
                <Field
                  label="Landlord's phone number (tenants only)"
                  htmlFor="landlordPhone"
                  error={errors.landlordPhone}
                >
                  <Input
                    id="landlordPhone"
                    type="tel"
                    inputMode="tel"
                    value={form.landlordPhone}
                    onChange={(e) => set("landlordPhone", e.target.value)}
                    placeholder="0712 345 678"
                    invalid={Boolean(errors.landlordPhone)}
                    disabled={busy}
                  />
                </Field>
              )}
            </div>
          </FormCard>

          <FormCard step={3} tone="orange" title="Meter" subtitle="Take these from the meter itself">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Meter number"
                htmlFor="meterNumber"
                error={errors.meterNumber}
                hint={errors.meterNumber ? undefined : "Leave blank to assign the next MTR number."}
              >
                <Input
                  id="meterNumber"
                  value={form.meterNumber}
                  onChange={(e) => set("meterNumber", e.target.value.toUpperCase())}
                  placeholder="MTR-9942"
                  invalid={Boolean(errors.meterNumber)}
                  disabled={busy}
                />
              </Field>
              <Field
                label="Opening reading (units)"
                htmlFor="openingReading"
                error={errors.openingReading}
                hint={errors.openingReading ? undefined : "Meters often start at 0 or 2. Enter exactly what the meter shows today."}
              >
                <Input
                  id="openingReading"
                  inputMode="decimal"
                  value={form.openingReading}
                  onChange={(e) => set("openingReading", e.target.value)}
                  invalid={Boolean(errors.openingReading)}
                  disabled={busy}
                />
              </Field>
            </div>
          </FormCard>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-[#e6ddfb] bg-[#f6f2fe] p-5 dark:border-violet-400/25 dark:bg-violet-500/10">
            <h2 className="text-lg font-bold text-foreground">What happens next</h2>

            <div className="mt-4" aria-live="polite">
              {!checkPhone ? (
                <p className="flex items-start gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Enter the phone number to check for duplicates.
                </p>
              ) : duplicate.isFetching ? (
                <p className="rounded-xl border border-border bg-card/70 px-3.5 py-3 text-sm text-muted-foreground">
                  Checking for a duplicate phone number…
                </p>
              ) : isDuplicate ? (
                <div className="rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-3 text-sm">
                  <p className="font-semibold text-warning">This phone number is already on file</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {duplicate.data?.accountNumber ? (
                      <>
                        Existing client <Code className="text-[0.75rem]">{duplicate.data.accountNumber}</Code>.
                      </>
                    ) : duplicate.data?.referenceNumber ? (
                      <>
                        Open application <Code className="text-[0.75rem]">{duplicate.data.referenceNumber}</Code>.
                      </>
                    ) : (
                      "Use the existing record instead."
                    )}
                  </p>
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  No duplicate phone number found
                </p>
              )}
            </div>

            <ol className="mt-5 space-y-4">
              <NextStep tone="blue" step={1} title="Account created">
                Number{" "}
                <Code className="text-[0.78rem] text-primary">
                  {preview.data?.accountNumber ?? "ACC-…"}
                </Code>{" "}
                is assigned for you.
              </NextStep>
              <NextStep tone="violet" step={2} title="Opening reading saved">
                It becomes the first &ldquo;previous reading&rdquo;. No bill is created yet.
              </NextStep>
              <NextStep tone="orange" step={3} title="Client gets a WhatsApp link">
                They set their own password. No temporary passwords are shared.
              </NextStep>
            </ol>

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                aria-label="Send the WhatsApp link now"
                checked={sendLink}
                onChange={(e) => setSendLink(e.target.checked)}
                disabled={busy}
                className="mt-0.5 size-4 rounded border-input accent-[#0077b6]"
              />
              <span>
                Send the WhatsApp link now
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  They can complete their details and set a password.
                </span>
              </span>
            </label>

            <div className="mt-5 space-y-2">
              <PrimaryButton className="w-full" loading={create.isPending} disabled={busy || isDuplicate} onClick={handleCreate}>
                {draft ? "Create client" : "Create client"}
              </PrimaryButton>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={busy}
                onClick={handleSaveDraft}
              >
                {saveDraft.isPending ? "Saving..." : "Save as draft"}
              </Button>
            </div>

            {serverError && (
              <div className="mt-4">
                <FormError>{serverError}</FormError>
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Passwords are never shared or stored in plain text. The client sets their own.
            </p>
            {!sendLink && (
              <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <MessageCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                No link will be sent. You can resend it from the client page later.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}