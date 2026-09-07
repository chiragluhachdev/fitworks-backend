import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendOtp, verifyOtp } from "../controllers/otp.controller";

const router = Router();

// Sending costs money, so cap it by IP on top of the per-number limits.
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: "Too many OTP requests. Please try again later." },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

router.post("/send", sendLimiter, sendOtp);
router.post("/verify", verifyLimiter, verifyOtp);

export default router;
