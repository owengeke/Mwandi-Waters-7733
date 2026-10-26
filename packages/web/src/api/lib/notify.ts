/**
 * One-time-code delivery. WhatsApp is the primary channel; SMS is the fallback for
 * numbers without WhatsApp (or when Meta rejects the send). With neither provider
 * configured the code is logged to the server console in development only, and the
 * API exposes it as `devCode` so local sign-in keeps working.
 */
import { sendSms, smsConfigured } from "./sms";
import { sendWhatsAppOtp, whatsappConfigured } from "./whatsapp";

export type DeliveryChannel = "whatsapp" | "sms" | "console";

export const otpDeliveryConfigured = () => whatsappConfigured() || smsConfigured();

export async function deliverOtp(phone: string, code: string): Promise<{ channel: DeliveryChannel }> {
  if (whatsappConfigured()) {
    try {
      await sendWhatsAppOtp(phone, code);
      return { channel: "whatsapp" };
    } catch (error) {
      console.error("[otp] WhatsApp delivery failed, falling back to SMS", error);
    }
  }

  if (smsConfigured()) {
    try {
      await sendSms(phone, `Your Mwandi Waters sign-in code is ${code}. It expires in 5 minutes. Do not share it.`);
      return { channel: "sms" };
    } catch (error) {
      console.error("[otp] SMS delivery failed", error);
    }
  }

  if (!otpDeliveryConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("No OTP delivery channel configured (set the WhatsApp or Africa's Talking variables)");
    }
    console.info(`[otp:dev] → ${phone}: ${code}`);
    return { channel: "console" };
  }

  throw new Error("Could not deliver the sign-in code on any configured channel");
}
