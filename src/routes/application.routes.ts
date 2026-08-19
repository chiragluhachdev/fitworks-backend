import { Router } from "express";
import { 
  applyForJob, 
  getTrainerApplications, 
  getGymApplications, 
  updateApplicationStatus 
} from "../controllers/application.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = Router();

// In a real app we'd use req.user for trainerId/gymId, but for MVP we use params or protect it
router.post("/", protect, authorize("trainer"), applyForJob);
router.get("/trainer/:trainerId", getTrainerApplications);
router.get("/gym/:gymId", getGymApplications);
router.put("/:id/status", updateApplicationStatus); // Can be protected with authorize("gym")

export default router;
