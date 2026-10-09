import { createAuthClient } from "better-auth/react";

const TOKEN_KEY = "mw-auth-token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/**
 * Better Auth client. Uses the bearer token (localStorage) as well as cookies so
 * sessions survive inside the preview iframe where third-party cookies are blocked.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
  fetchOptions: {
    auth: { type: "Bearer", token: () => getToken() },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) setToken(token);
    },
  },
});

export type PortalUser = { id: string; name: string; role: string };
type PortalResult = { token: string; user: PortalUser };
export type OtpSendResult = { sent: boolean; destination: string | null; expiresIn: number; devCode?: string };

async function post<T>(path: string, body: unknown): Promise<T> {
  const { data, error } = await authClient.$fetch<T>(path, { method: "POST", body: body as Record<string, unknown> });
  if (error) {
    const msg =
      error.status === 429
        ? "Too many attempts. Please wait a minute and try again."
        : (error.message ?? "Something went wrong. Please try again.");
    throw new Error(msg);
  }
  return data as T;
}

/** Unified portal sign-in — identifier may be email, phone or ACC-XXXX. */
export const portalAuth = {
  signInWithPassword: (identifier: string, password: string) =>
    post<PortalResult>("/portal/sign-in", { identifier, password }),
  sendOtp: (identifier: string) => post<OtpSendResult>("/portal/otp/send", { identifier }),
  verifyOtp: (identifier: string, code: string) => post<PortalResult>("/portal/otp/verify", { identifier, code }),
  signOut: async () => {
    try {
      await authClient.signOut();
    } finally {
      clearToken();
    }
  },
};
