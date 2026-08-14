// Password length policy — ONE source of truth, imported by the server actions
// (signup, change-password) and their client forms alike. Kept separate from
// `password.ts` on purpose: that module pulls in bcrypt, which must never be
// bundled into the browser. This file is pure and client-safe.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 16;

/** Returns an error message if the password breaks the length policy, else null. */
export function validatePasswordLength(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Password must be at most ${PASSWORD_MAX} characters.`;
  }
  return null;
}
