import { Router } from "express";
import { registerGym, registerTrainer, login, loginWithOtp, updatePassword } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/register/gym", registerGym);
router.post("/register/trainer", registerTrainer);
router.post("/login", login);
router.post("/login-otp", loginWithOtp);
router.put("/update-password", protect, updatePassword);

export default router;
