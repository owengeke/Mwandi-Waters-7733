/**
 * Safaricom Daraja — M-Pesa STK Push (Lipa na M-Pesa Online).
 *
 * Server-side only: the consumer key, secret and passkey are never returned to
 * the browser. When the four credentials + callback URL are missing the app
 * falls back to a clearly labelled demo mode (see routes/account.ts).
 *
 * Sandbox:  https://sandbox.safaricom.co.ke
 * Production: https://api.safaricom.co.ke
 */
import { darajaPhone } from "./mpesa";

export interface MpesaConfig {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  /** Number shown as the manual Paybill fallback. Empty when not configured. */
  paybillDisplay: string;
}

export function mpesaConfig(): MpesaConfig {
  return {
    environment: process.env.MPESA_ENV === "production" ? "production" : "sandbox",
    consumerKey: process.env.MPESA_CONSUMER_KEY?.trim() ?? "",
    consumerSecret: process.env.MPESA_CONSUMER_SECRET?.trim() ?? "",
    shortcode: process.env.MPESA_SHORTCODE?.trim() ?? "",
    passkey: process.env.MPESA_PASSKEY?.trim() ?? "",
    callbackUrl: process.env.MPESA_CALLBACK_URL?.trim() ?? "",
    paybillDisplay: process.env.MPESA_PAYBILL_DISPLAY?.trim() ?? "",
  };
}

/** Real STK Push is used only when every credential is present. */
export function mpesaConfigured() {
  const c = mpesaConfig();
  return Boolean(c.consumerKey && c.consumerSecret && c.shortcode && c.passkey && c.callbackUrl);
}

const baseUrl = (c: MpesaConfig) =>
  c.environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

/** Kenya is UTC+3 all year (no DST) — Daraja's password timestamp is EAT. */
function nairobiTimestamp() {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/\D/g, "").slice(0, 14); // yyyyMMddHHmmss
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(c: MpesaConfig) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const credentials = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const res = await fetch(`${baseUrl(c)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Daraja OAuth failed (${res.status})`);

  const data = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!data.access_token) throw new Error("Daraja OAuth returned no access token");

  const ttl = Number(data.expires_in ?? 3599);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttl * 1000 };
  return data.access_token;
}

export interface StkPushInput {
  amountKes: number;
  phoneNumber: string; // +2547XXXXXXXX
  accountReference: string;
  description: string;
}

export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
}

export async function stkPush(input: StkPushInput): Promise<StkPushResult> {
  const c = mpesaConfig();
  if (!mpesaConfigured()) throw new Error("M-Pesa is not configured");

  const token = await accessToken(c);
  const timestamp = nairobiTimestamp();
  const password = Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString("base64");
  const phone = darajaPhone(input.phoneNumber);

  const res = await fetch(`${baseUrl(c)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(input.amountKes),
      PartyA: phone,
      PartyB: c.shortcode,
      PhoneNumber: phone,
      CallBackURL: c.callbackUrl,
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 60),
    }),
  });

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* keep the raw body for the error below */
  }

  if (!res.ok || data.ResponseCode !== "0") {
    const message = String(data.errorMessage ?? data.ResponseDescription ?? `STK push failed (${res.status})`);
    throw new Error(message);
  }

  return {
    checkoutRequestId: String(data.CheckoutRequestID),
    merchantRequestId: String(data.MerchantRequestID ?? ""),
    customerMessage: String(data.CustomerMessage ?? "Check your phone to authorise the payment."),
  };
}
