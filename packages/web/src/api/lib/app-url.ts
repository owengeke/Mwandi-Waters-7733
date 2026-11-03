/** Absolute links used in WhatsApp messages. */
export const appBaseUrl = () => (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");

/** The public "Complete your details" route. */
export const onboardingLink = (token: string) => `${appBaseUrl()}/complete/${token}`;