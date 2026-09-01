import { Router } from "express";
import { 
  applyForJob, 
  getTrainerApplications, 
  getGymApplications, 
  updateApplicationStatus,
  deleteApplication
} from "../controllers/application.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, authorize("trainer"), applyForJob);
router.get("/trainer/:trainerId", protect, getTrainerApplications);
router.get("/gym/:gymId", protect, getGymApplications);
router.put("/:id/status", protect, authorize("gym", "admin"), updateApplicationStatus);
router.delete("/:id", protect, deleteApplication);

export default router;
