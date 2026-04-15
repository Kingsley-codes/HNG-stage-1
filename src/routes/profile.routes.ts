import { Router } from "express";
import { ProfileController } from "../controllers/profile.controller";
import { ProfileService } from "../services/profile.service";
import { getDatabase } from "../db/database";

const router = Router();

// Lazy initialization of services
let profileController: ProfileController | null = null;

const getProfileController = (): ProfileController => {
  if (!profileController) {
    const db = getDatabase();
    const profileService = new ProfileService(db);
    profileController = new ProfileController(profileService);
  }
  return profileController;
};

// Routes with lazy controller access
router.post("/profiles", (req, res, next) => {
  getProfileController().createProfile(req, res, next);
});

router.get("/profiles/:id", (req, res, next) => {
  getProfileController().getProfileById(req, res, next);
});

router.get("/profiles", (req, res, next) => {
  getProfileController().getProfiles(req, res, next);
});

router.delete("/profiles/:id", (req, res, next) => {
  getProfileController().deleteProfile(req, res, next);
});

export default router;
