import express from "express";
import { 
  getGymBySlug, 
  updateGymProfile, 
  getGymDashboardStats 
} from "../controllers/gym.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/:slug", getGymBySlug);
router.get("/:slug/dashboard", getGymDashboardStats);
router.put("/:slug/profile", protect, authorize("gym", "admin"), updateGymProfile);

export default router;
