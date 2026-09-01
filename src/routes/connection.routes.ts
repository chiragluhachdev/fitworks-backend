import { Router } from "express";
import { 
  sendConnectionRequest, 
  getTrainerConnections, 
  updateConnectionStatus 
} from "../controllers/connection.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, authorize("gym"), sendConnectionRequest);
router.get("/trainer/:trainerId", protect, getTrainerConnections);
router.put("/:id/status", protect, authorize("trainer", "admin"), updateConnectionStatus);

export default router;
