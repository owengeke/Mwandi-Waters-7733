/** Password rules shared by the public "Complete your details" flow. */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** The four-bar strength meter. `score` is 0–4; 0 means too short to use. */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  hint: string;
}

/**
 * A deliberately simple, offline strength hint. The only hard requirement is
 * the length the API enforces; the score only guides the client towards a
 * longer, more varied password.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 0,
      label: "Too short",
      hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;

  let score = 1;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (variety >= 3) score += 1;

  const capped = Math.min(score, 4) as 1 | 2 | 3 | 4;
  const copy: Record<Exclude<PasswordStrength["score"], 0>, Omit<PasswordStrength, "score">> = {
    1: { label: "Weak", hint: "Add a number, a capital letter or a symbol." },
    2: { label: "Fair", hint: "A longer phrase would be stronger." },
    3: { label: "Good", hint: "Good password. A few more characters makes it stronger." },
    4: { label: "Strong", hint: "Strong password." },
  };

  return { score: capped, ...copy[capped] };
}

/** Matches the API's step 4 rule, so the client never posts a password it will reject. */
export function isPasswordValid(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}
