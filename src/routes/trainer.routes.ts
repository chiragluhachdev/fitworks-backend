import express from "express";
import { 
  getTrainerBySlug, 
  updateTrainerProfile, 
  submitVerificationDocuments, 
  getTrainerDashboardStats 
} from "../controllers/trainer.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = express.Router();

// There is no trainer directory. Gyms post vacancies and see only the trainers
// who applied to them, via /applications/gym/:gymId. Nothing lists trainers.
router.get("/:slug", protect, getTrainerBySlug);
router.get("/:slug/dashboard", protect, getTrainerDashboardStats);
router.put("/:slug/profile", protect, authorize("trainer", "admin"), updateTrainerProfile);
router.post("/:slug/verification", protect, authorize("trainer", "admin"), submitVerificationDocuments);

export default router;
