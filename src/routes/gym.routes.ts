import express from "express";
import {
  getGymBySlug,
  updateGymProfile,
  getGymDashboardStats,
  getGymRecommendations,
  setGymInterest,
  getGymPlans,
  requestGymPlan,
} from "../controllers/gym.controller";
import { protect, authorize, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

// Static path first — otherwise "plans" is read as a gym slug.
router.get("/plans", getGymPlans);

router.get("/:slug", optionalAuth, getGymBySlug);
router.get("/:slug/dashboard", protect, getGymDashboardStats);
router.get("/:slug/recommendations", protect, getGymRecommendations);
router.put("/:slug/profile", protect, authorize("gym", "admin"), updateGymProfile);
router.post("/:slug/plan-request", protect, authorize("gym", "admin"), requestGymPlan);

// A gym's reply to a trainer our team put forward.
router.put("/recommendations/:id/interest", protect, authorize("gym", "admin"), setGymInterest);

export default router;
