import { Router } from "express";
import { 
  sendConnectionRequest, 
  getTrainerConnections, 
  updateConnectionStatus 
} from "../controllers/connection.controller";
import { protect, authorize } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, authorize("gym"), sendConnectionRequest);
router.get("/trainer/:trainerId", getTrainerConnections);
router.put("/:id/status", updateConnectionStatus);

export default router;
