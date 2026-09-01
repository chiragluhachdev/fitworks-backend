import { Router } from "express";
import {
  createTrainerPaymentOrder,
  verifyTrainerPayment,
  getTrainerPaymentStatus,
  razorpayWebhook,
} from "../controllers/payment.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

// Trainer-initiated: both require a logged-in trainer who owns the profile.
router.post("/create-order", protect, createTrainerPaymentOrder);
router.post("/verify-order", protect, verifyTrainerPayment);

// Razorpay server-to-server. Authenticated by HMAC signature, not by JWT.
router.post("/webhook", razorpayWebhook);

router.get("/status/:trainerSlug", getTrainerPaymentStatus);

export default router;
