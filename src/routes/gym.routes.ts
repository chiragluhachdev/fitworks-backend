import express from "express";
import {
  getGymBySlug,
  updateGymProfile,
  getGymDashboardStats,
  getGymPlans,
} from "../controllers/gym.controller";
import {
  createGymOrder,
  verifyGymPayment,
  getGymMembership,
} from "../controllers/gymPayment.controller";
import { protect, authorize, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

// Static path first — otherwise "plans" is read as a gym slug.
router.get("/plans", getGymPlans);

router.get("/:slug", optionalAuth, getGymBySlug);
router.get("/:slug/dashboard", protect, getGymDashboardStats);
router.put("/:slug/profile", protect, authorize("gym", "admin"), updateGymProfile);

// Membership: Razorpay checkout, raised and verified server-side.
router.get("/:slug/membership", protect, getGymMembership);
router.post("/:slug/membership/order", protect, authorize("gym", "admin"), createGymOrder);
router.post("/:slug/membership/verify", protect, authorize("gym", "admin"), verifyGymPayment);

export default router;
