import { getToken } from "./auth";

/**
 * PDF receipts are private, so they cannot be opened with a bare <a href>:
 * fetch them with the bearer token, then hand the blob to the browser.
 */
async function fetchReceipt(paymentId: number) {
  const token = getToken();
  const res = await fetch(`/api/receipts/${paymentId}.pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Could not load the receipt (${res.status}).`);
  }
  return res.blob();
}

const fileName = (paymentId: number, receipt?: string | null) =>
  `mwandi-receipt-${receipt ?? paymentId}.pdf`;

/** Opens the PDF in a new tab. Must be called directly from a click for pop-up blockers. */
export async function openReceipt(paymentId: number) {
  const tab = window.open("", "_blank");
  try {
    const blob = await fetchReceipt(paymentId);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export async function downloadReceipt(paymentId: number, receipt?: string | null) {
  const blob = await fetchReceipt(paymentId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(paymentId, receipt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
