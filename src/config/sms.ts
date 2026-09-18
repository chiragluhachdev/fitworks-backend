import crypto from "crypto";

const MESSAGE_CENTRAL_URL = "https://cpaas.messagecentral.com/verification/v3/send";

// Read at call time, not module load: ES imports are evaluated before
// dotenv.config() runs in index.ts, so a top-level read is always empty.
const apiKey = () => process.env.MESSAGE_CENTRAL_AUTH_TOKEN || "";

export const smsConfigured = () => Boolean(apiKey());

export interface SmsResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

/**
 * Sends one transactional SMS through Message Central.
 */
export const sendSms = async (phone: string, message: string): Promise<SmsResult> => {
  const token = apiKey();
  if (!token) {
    console.warn(`[sms] MESSAGE_CENTRAL_AUTH_TOKEN not set — would have sent to ${phone}: ${message}`);
    return { ok: false, error: "SMS not configured" };
  }

  // Use the MessageNow API endpoint by passing flowType=SMS and message
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
    
    // Message Central success response typically has responseCode 200
    if (res.ok && data?.responseCode === 200) {
      return { ok: true, requestId: data?.data?.verificationId || data?.data?.transactionId };
    }
    
    console.error("[sms] Message Central rejected:", data);
    return { ok: false, error: data?.message || "SMS Provider rejected request" };
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
