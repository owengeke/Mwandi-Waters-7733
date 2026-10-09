/**
 * Outbound SMS. Uses Africa's Talking when AT_USERNAME + AT_API_KEY are set in .env;
 * otherwise logs to the server console (development only).
 */
export const smsConfigured = () => Boolean(process.env.AT_USERNAME && process.env.AT_API_KEY);

export async function sendSms(to: string, message: string) {
  if (!smsConfigured()) {
    console.info(`[sms:dev] → ${to}: ${message}`);
    return;
  }
  const sandbox = process.env.AT_USERNAME === "sandbox";
  const url = sandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  const body = new URLSearchParams({ username: process.env.AT_USERNAME!, to, message });
  if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apiKey: process.env.AT_API_KEY!,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`SMS send failed (${res.status})`);
}
