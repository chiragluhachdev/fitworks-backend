import express from "express";
import { 
  getTrainers, 
  getTrainerBySlug, 
  updateTrainerProfile, 
  submitVerificationDocuments, 
  getTrainerDashboardStats 
} from "../controllers/trainer.controller";
import { protect, authorize, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/", getTrainers);
router.get("/:slug", optionalAuth, getTrainerBySlug);
router.get("/:slug/dashboard", protect, getTrainerDashboardStats);
router.put("/:slug/profile", protect, authorize("trainer", "admin"), updateTrainerProfile);
router.post("/:slug/verification", protect, authorize("trainer", "admin"), submitVerificationDocuments);

export default router;
