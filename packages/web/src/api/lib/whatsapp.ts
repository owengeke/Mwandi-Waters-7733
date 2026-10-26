/**
 * WhatsApp OTP delivery via the Meta WhatsApp Cloud API.
 *
 * WhatsApp does not allow free-form text to a user who has not messaged you first,
 * so a sign-in code must go out as a pre-approved *authentication* template with a
 * copy-code button. Create it once in WhatsApp Manager (Business settings →
 * Templates → Authentication) and set:
 *
 *   WHATSAPP_PHONE_NUMBER_ID      Meta app → WhatsApp → API setup
 *   WHATSAPP_ACCESS_TOKEN         permanent System User token
 *   WHATSAPP_OTP_TEMPLATE         template name, e.g. mwandi_otp
 *   WHATSAPP_OTP_TEMPLATE_LANG    default: en
 *   WHATSAPP_API_VERSION          default: v23.0
 *
 * The template body must be a single variable, e.g. "{{1}} is your Mwandi Waters
 * verification code." with a Copy code button.
 */

const GRAPH_URL = "https://graph.facebook.com";

export const whatsappConfigured = () =>
  Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

/** +254 719 709 885 → 254719709885 (Cloud API wants digits only). */
export const toWhatsAppId = (phone: string) => phone.replace(/\D/g, "");

export async function sendWhatsAppOtp(to: string, code: string): Promise<void> {
  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const template = process.env.WHATSAPP_OTP_TEMPLATE ?? "mwandi_otp";
  const language = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? "en";

  const res = await fetch(`${GRAPH_URL}/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWhatsAppId(to),
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: [
          // {{1}} in the template body
          { type: "body", parameters: [{ type: "text", text: code }] },
          // Copy-code button (sub_type stays "url" for authentication templates)
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}
