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
  updateGym,
  deleteGym,
  getTrainerDetail,
  getSubscriptions,
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
router.get("/subscriptions", getSubscriptions);
router.get("/trainers/:id", getTrainerDetail);

// Gym actions
router.put("/gyms/:id", updateGym);
router.delete("/gyms/:id", deleteGym);

// Verification actions
router.put("/trainers/:id/verify", updateTrainerVerification);

export default router;
