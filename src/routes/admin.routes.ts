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
  deleteTrainer,
  getSettings,
  updateSettings,
} from "../controllers/admin.controller";
import {
  getVacancyBoard,
  getVacancyDetail,
  updateVacancyStage,
  searchTrainersForVacancy,
  shortlistTrainer,
  updateShortlistEntry,
  removeShortlistEntry,
  updateGymSubscription,
} from "../controllers/hiring.controller";
import {
  getInstantLeads,
  importInstantLeads,
  updateInstantLead,
  deleteInstantLead,
} from "../controllers/instantLead.controller";
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

// ── Hiring workflow: post vacancy -> review -> shortlist -> connect ──
// Static segments come before "/vacancies/:id" so they aren't read as an id.
router.get("/hiring/trainer-search", searchTrainersForVacancy);
router.get("/hiring/vacancies", getVacancyBoard);
router.get("/hiring/vacancies/:id", getVacancyDetail);
router.put("/hiring/vacancies/:id/stage", updateVacancyStage);
router.post("/hiring/vacancies/:id/shortlist", shortlistTrainer);
router.patch("/hiring/shortlist/:id", updateShortlistEntry);
router.delete("/hiring/shortlist/:id", removeShortlistEntry);

// Gym actions
router.put("/gyms/:id", updateGym);
router.put("/gyms/:id/subscription", updateGymSubscription);
router.delete("/gyms/:id", deleteGym);

// Verification actions
router.put("/trainers/:id/verify", updateTrainerVerification);

// Removes the profile, its login and every application/invitation attached.
router.delete("/trainers/:id", deleteTrainer);

// Meta instant-form leads. Self-contained: nothing else reads this collection.
router.get("/instant-leads", getInstantLeads);
router.post("/instant-leads/import", importInstantLeads);
router.patch("/instant-leads/:id", updateInstantLead);
router.delete("/instant-leads/:id", deleteInstantLead);

// Settings
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

export default router;
