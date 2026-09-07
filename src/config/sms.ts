import crypto from "crypto";

const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

// Read at call time, not module load: ES imports are evaluated before
// dotenv.config() runs in index.ts, so a top-level read is always empty.
const apiKey = () => process.env.FAST2SMS_API_KEY || "";

export const smsConfigured = () => Boolean(apiKey());

export interface SmsResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

/**
 * Sends one transactional SMS through Fast2SMS.
 *
 * Uses `route=q` (Quick SMS), the only route this account can currently use —
 * `route=otp` needs website verification and `route=v3` needs an approved DLT
 * sender ID. Once either is completed, set FAST2SMS_ROUTE=otp and the dedicated
 * OTP route (cheaper, branded) takes over with no other change.
 */
export const sendSms = async (phone: string, message: string): Promise<SmsResult> => {
  const FAST2SMS_KEY = apiKey();
  if (!FAST2SMS_KEY) {
    console.warn(`[sms] FAST2SMS_API_KEY not set — would have sent to ${phone}: ${message}`);
    return { ok: false, error: "SMS not configured" };
  }

  const route = process.env.FAST2SMS_ROUTE || "q";
  const url = new URL(FAST2SMS_URL);
  url.searchParams.set("numbers", phone);

  if (route === "otp") {
    // The dedicated OTP route takes only the digits and renders its own copy.
    const code = message.match(/\d{4,8}/)?.[0] || "";
    url.searchParams.set("route", "otp");
    url.searchParams.set("variables_values", code);
  } else {
    url.searchParams.set("route", route);
    url.searchParams.set("message", message);
    url.searchParams.set("flash", "0");
  }

  try {
    const res = await fetch(url, { headers: { authorization: FAST2SMS_KEY } });
    const data: any = await res.json().catch(() => ({}));
    if (data?.return === true) {
      return { ok: true, requestId: data.request_id };
    }
    console.error("[sms] Fast2SMS rejected:", data?.message || data);
    return { ok: false, error: Array.isArray(data?.message) ? data.message[0] : data?.message };
  } catch (error: any) {
    console.error("[sms] request failed:", error?.message);
    return { ok: false, error: "Could not reach the SMS provider" };
  }
};

/* ───────────────────────────── OTP helpers ───────────────────────────── */

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Per number, per rolling hour. */
export const OTP_MAX_SENDS_PER_HOUR = 5;

/** Cryptographically random 6-digit code. */
export const generateOtp = (): string =>
  String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");

/** Codes are stored hashed — a database leak must not expose live OTPs. */
export const hashOtp = (code: string): string =>
  crypto.createHash("sha256").update(`${code}:${process.env.JWT_SECRET || ""}`).digest("hex");

export const otpMessage = (code: string, purpose: "registration" | "login") =>
  `Your OTP for FitWorks ${purpose} is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it.`;
