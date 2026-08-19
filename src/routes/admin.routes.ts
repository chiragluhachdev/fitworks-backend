import express from "express";
import {
  getDashboardStats,
  getUsers,
  getTrainers,
  getGyms,
  getVacancies,
  getApplications,
  getConnections,
  updateTrainerVerification,
} from "../controllers/admin.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = express.Router();

// Protect all admin routes with authentication and admin role authorization
router.use(protect);
router.use(authorize("admin"));

// Dashboard Statistics
router.get("/stats", getDashboardStats);

// Entity Lists
router.get("/users", getUsers);
router.get("/trainers", getTrainers);
router.get("/gyms", getGyms);
router.get("/vacancies", getVacancies);
router.get("/applications", getApplications);
router.get("/connections", getConnections);

// Verification actions
router.put("/trainers/:id/verify", updateTrainerVerification);

export default router;
