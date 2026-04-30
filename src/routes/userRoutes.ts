import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { getCurrentUserProfile } from "../controllers/userController.js";

const router = Router();

router.get("/me", authenticate, getCurrentUserProfile);

export default router;
