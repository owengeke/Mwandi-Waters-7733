/**
 * One-time-code delivery. WhatsApp is the primary channel; SMS is the fallback for
 * numbers without WhatsApp (or when Meta rejects the send). With neither provider
 * configured the code is logged to the server console in development only, and the
 * API exposes it as `devCode` so local sign-in keeps working.
 */
import { sendSms, smsConfigured } from "./sms";
import {
  sendWhatsAppOnboardingLink,
  sendWhatsAppOtp,
  sendWhatsAppWelcome,
  whatsappConfigured,
  whatsappOnboardingConfigured,
  whatsappWelcomeConfigured,
} from "./whatsapp";

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

// ---------- One-time onboarding links ----------

export type LinkDeliveryChannel = DeliveryChannel;

/**
 * Delivers the "Complete your details" link. With no provider configured the
 * link is deliberately NOT logged (it contains a bearer token); the caller
 * returns a development-only `devLink` to the signed-in staff member instead.
 */
export async function deliverOnboardingLink(
  phone: string,
  link: string,
): Promise<{ channel: LinkDeliveryChannel }> {
  if (whatsappOnboardingConfigured()) {
    try {
      await sendWhatsAppOnboardingLink(phone, link);
      return { channel: "whatsapp" };
    } catch (error) {
      console.error("[onboarding] WhatsApp link delivery failed, falling back to SMS", error);
    }
  }

  if (smsConfigured()) {
    try {
      await sendSms(phone, `Complete your Mwandi Waters details: ${link}`);
      return { channel: "sms" };
    } catch (error) {
      console.error("[onboarding] SMS link delivery failed", error);
    }
  }

  return { channel: "console" };
}

// ---------- Welcome message ----------

/** Sent after installation; never contains a token or a password. */
export async function deliverWelcomeMessage(
  phone: string,
  firstName: string,
  accountNumber: string,
): Promise<{ sent: boolean; channel: "whatsapp" | "log" }> {
  if (!whatsappWelcomeConfigured()) {
    console.log(`[welcome:demo] ${firstName} — ${accountNumber}`);
    return { sent: false, channel: "log" };
  }
  try {
    await sendWhatsAppWelcome(phone, firstName, accountNumber);
    return { sent: true, channel: "whatsapp" };
  } catch (error) {
    console.error("[welcome] WhatsApp delivery failed", error);
    return { sent: false, channel: "log" };
  }
}
