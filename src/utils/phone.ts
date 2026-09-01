/**
 * Indian mobile numbers are stored as a bare 10-digit string so that
 * "+91 98765 43210", "098765 43210" and "9876543210" all resolve to one
 * account. Login and registration both normalise through here.
 */
export const normalizePhone = (input: unknown): string => {
  const digits = String(input ?? "").replace(/\D/g, "");
  // Drop a 91 country code or a leading 0 before taking the last 10 digits.
  return digits.slice(-10);
};

export const isValidPhone = (input: unknown): boolean => {
  const p = normalizePhone(input);
  // Indian mobile numbers start 6-9.
  return /^[6-9]\d{9}$/.test(p);
};

export const looksLikeEmail = (input: unknown): boolean =>
  typeof input === "string" && input.includes("@");
