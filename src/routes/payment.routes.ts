import { Router } from "express";
import {
  createTrainerPaymentOrder,
  verifyTrainerPayment,
  getTrainerPaymentStatus,
} from "../controllers/payment.controller";

const router = Router();

// POST /api/payments/create-order
router.post("/create-order", createTrainerPaymentOrder);

// POST /api/payments/verify-order
router.post("/verify-order", verifyTrainerPayment);

// GET /api/payments/status/:trainerSlug
router.get("/status/:trainerSlug", getTrainerPaymentStatus);

export default router;
