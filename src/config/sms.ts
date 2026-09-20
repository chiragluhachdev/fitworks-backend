import crypto from "crypto";

const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";
// const MESSAGE_CENTRAL_URL = "https://cpaas.messagecentral.com/verification/v3/send";

// Read at call time, not module load: ES imports are evaluated before
// dotenv.config() runs in index.ts, so a top-level read is always empty.
const apiKey = () => process.env.FAST2SMS_API_KEY || ""; // process.env.MESSAGE_CENTRAL_AUTH_TOKEN || "";

export const smsConfigured = () => Boolean(apiKey());

export interface SmsResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

/**
 * Sends one transactional SMS through Fast2SMS.
 */
export const sendSms = async (phone: string, message: string): Promise<SmsResult> => {
  const token = apiKey();
  if (!token) {
    console.warn(`[sms] API_KEY not set — would have sent to ${phone}: ${message}`);
    return { ok: false, error: "SMS not configured" };
  }

  /* 
  // Message Central Logic (Commented out)
  const url = new URL(MESSAGE_CENTRAL_URL);
  url.searchParams.set("countryCode", "91");
  url.searchParams.set("flowType", "SMS");
  url.searchParams.set("mobileNumber", phone);
  url.searchParams.set("message", message);

  try {
    const res = await fetch(url, { 
      method: "POST",
      headers: { authToken: token } 
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data?.responseCode === 200) {
      return { ok: true, requestId: data?.data?.verificationId || data?.data?.transactionId };
    }
    return { ok: false, error: data?.message || "SMS Provider rejected request" };
  } catch (error: any) {
    return { ok: false, error: "Could not reach the SMS provider" };
  }
  */

  // Fast2SMS Logic
  const route = process.env.FAST2SMS_ROUTE || "q";
  const url = new URL(FAST2SMS_URL);
  url.searchParams.set("numbers", phone);

  if (route === "otp") {
    const code = message.match(/\d{4,8}/)?.[0] || "";
    url.searchParams.set("route", "otp");
    url.searchParams.set("variables_values", code);
  } else {
    url.searchParams.set("route", route);
    url.searchParams.set("message", message);
    url.searchParams.set("flash", "0");
  }

  try {
    const res = await fetch(url, { headers: { authorization: token } });
    const data: any = await res.json().catch(() => ({}));
    if (data?.return === true) {
      return { ok: true, requestId: data.request_id };
    }
    console.error("[sms] Fast2SMS rejected:", data);
    return { ok: false, error: data?.message || "SMS Provider rejected request" };
  } catch (error: any) {
    console.error("[sms] request failed:", error?.message);
    return { ok: false, error: "Could not reach the SMS provider" };
  }
};

/* ───────────────────────────── OTP helpers ───────────────────────────── */

export const OTP_LENGTH = 4;
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
