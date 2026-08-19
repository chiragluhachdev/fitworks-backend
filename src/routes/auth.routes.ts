import { Router } from "express";
import { registerGym, registerTrainer, login, updatePassword } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/register/gym", registerGym);
router.post("/register/trainer", registerTrainer);
router.post("/login", login);
router.put("/update-password", updatePassword);

export default router;
