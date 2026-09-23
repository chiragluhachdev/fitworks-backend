import express from "express";
import { 
  createJob, 
  getJobs, 
  getJobById, 
  getJobsByGym, 
  updateJob, 
  deleteJob 
} from "../controllers/job.controller";
import { protect, authorize, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/", protect, authorize("gym", "admin"), createJob);
router.get("/", optionalAuth, getJobs);
router.get("/gym/slug/:gymSlug", optionalAuth, getJobsByGym);
router.get("/gym/:gymId", optionalAuth, getJobsByGym);
router.get("/:id", optionalAuth, getJobById);
router.put("/:id", protect, authorize("gym", "admin"), updateJob);
router.delete("/:id", protect, authorize("gym", "admin"), deleteJob);

export default router;
