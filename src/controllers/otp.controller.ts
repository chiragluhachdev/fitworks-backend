import { Request, Response } from "express";
import crypto from "crypto";
import { OtpToken } from "../models/OtpToken";
import { User } from "../models/User";
import { normalizePhone, isValidPhone } from "../utils/phone";
import {
  sendSms,
  generateOtp,
  hashOtp,
  otpMessage,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_SENDS_PER_HOUR,
} from "../config/sms";

/* ───────────────────────────── SEND OTP ───────────────────────────── */

export const sendOtp = async (req: Request, res: Response): Promise<any> => {
  try {
    const phone = normalizePhone(req.body.phone);
    const purpose: "registration" | "login" = req.body.purpose === "login" ? "login" : "registration";

    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: "Enter a valid 10-digit mobile number" });
    }

    const existingUser = await User.findOne({ phone });

    // Fail early rather than burning an SMS on a number that can't proceed.
    if (purpose === "registration" && existingUser) {
      return res.status(400).json({
        success: false,
        message: "This mobile number is already registered. Please log in instead.",
      });
    }
    if (purpose === "login" && !existingUser) {
      return res.status(404).json({
        success: false,
        message: "No account found for this mobile number.",
      });
    }

    const now = new Date();
    const existing = await OtpToken.findOne({ phone, purpose, verified: false }).sort({ createdAt: -1 });

    // Counters have to survive the delete-and-recreate below. Counting documents
    // instead would always come back as 1, which is why the hourly cap never
    // actually fired.
    let sendCount = 1;
    let windowStartedAt = now;

    if (existing) {
      const sinceLast = (now.getTime() - existing.lastSentAt.getTime()) / 1000;
      if (sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast)}s before requesting another code`,
          retryAfter: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast),
        });
      }

      const openedAt = existing.windowStartedAt ?? existing.createdAt;
      if (now.getTime() - new Date(openedAt).getTime() < 3600_000) {
        sendCount = (existing.sendCount || 1) + 1;
        windowStartedAt = new Date(openedAt);
      }
    }

    // Rolling hourly cap per number, so a single number can't drain the wallet.
    if (sendCount > OTP_MAX_SENDS_PER_HOUR) {
      const minutesLeft = Math.ceil(
        (3600_000 - (now.getTime() - windowStartedAt.getTime())) / 60_000
      );
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        retryAfter: minutesLeft * 60,
      });
    }

    const code = generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

    // One live challenge per number+purpose — replace any earlier unverified one.
    await OtpToken.deleteMany({ phone, purpose, verified: false });
    await OtpToken.create({
      phone,
      codeHash: hashOtp(code),
      purpose,
      expiresAt,
      lastSentAt: now,
      sendCount,
      windowStartedAt,
    });

    const sms = await sendSms(phone, otpMessage(code, purpose));
    if (!sms.ok) {
      await OtpToken.deleteMany({ phone, purpose, verified: false });
      return res.status(502).json({
        success: false,
        message: sms.error || "Could not send the OTP. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent to +91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
      expiresInMinutes: OTP_TTL_MINUTES,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
  } catch (error: any) {
    console.error("Send OTP Error:", error);
    return res.status(500).json({ success: false, message: "Server error sending OTP" });
  }
};

/* ──────────────────────────── VERIFY OTP ──────────────────────────── */

export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    const purpose: "registration" | "login" = req.body.purpose === "login" ? "login" : "registration";

    if (!isValidPhone(phone) || !code) {
      return res.status(400).json({ success: false, message: "Mobile number and OTP are required" });
    }

    const token = await OtpToken.findOne({ phone, purpose, verified: false }).sort({ createdAt: -1 });
    if (!token) {
      return res.status(400).json({ success: false, message: "No active OTP. Please request a new one." });
    }
    if (token.expiresAt < new Date()) {
      await token.deleteOne();
      return res.status(400).json({ success: false, message: "This OTP has expired. Please request a new one." });
    }
    if (token.attempts >= OTP_MAX_ATTEMPTS) {
      await token.deleteOne();
      return res.status(429).json({ success: false, message: "Too many incorrect attempts. Please request a new OTP." });
    }

    const provided = Buffer.from(hashOtp(code), "utf8");
    const expected = Buffer.from(token.codeHash, "utf8");
    const matches = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

    if (!matches) {
      token.attempts += 1;
      await token.save();
      const left = OTP_MAX_ATTEMPTS - token.attempts;
      return res.status(400).json({
        success: false,
        message: left > 0 ? `Incorrect OTP. ${left} attempt${left === 1 ? "" : "s"} left.` : "Incorrect OTP.",
        attemptsLeft: Math.max(0, left),
      });
    }

    // Short-lived proof of ownership, presented when completing the action.
    const verificationToken = crypto.randomBytes(24).toString("hex");
    token.verified = true;
    token.verificationToken = verificationToken;
    token.expiresAt = new Date(Date.now() + 30 * 60_000); // 30 min to finish signing up
    await token.save();

    return res.status(200).json({
      success: true,
      message: "Mobile number verified",
      verificationToken,
      phone,
    });
  } catch (error: any) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ success: false, message: "Server error verifying OTP" });
  }
};

/**
 * Confirms a phone was proven via OTP. Consumes the token so it cannot be
 * replayed for a second account.
 */
export const consumePhoneVerification = async (
  phone: string,
  verificationToken: string,
  purpose: "registration" | "login"
): Promise<boolean> => {
  if (!verificationToken) return false;
  const token = await OtpToken.findOne({ phone, purpose, verificationToken, verified: true });
  if (!token || token.expiresAt < new Date()) return false;
  await token.deleteOne();
  return true;
};
