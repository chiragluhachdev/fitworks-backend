import express from "express";
import { 
  createJob, 
  getJobs, 
  getJobById, 
  getJobsByGym, 
  updateJob, 
  deleteJob 
} from "../controllers/job.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/", protect, authorize("gym", "admin"), createJob);
router.get("/", getJobs);
router.get("/gym/slug/:gymSlug", getJobsByGym);
router.get("/gym/:gymId", getJobsByGym);
router.get("/:id", getJobById);
router.put("/:id", protect, authorize("gym", "admin"), updateJob);
router.delete("/:id", protect, authorize("gym", "admin"), deleteJob);

export default router;
