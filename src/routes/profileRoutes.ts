// src/routes/profileRoutes.ts
import { Router } from "express";
import {
  createProfile,
  importProfiles,
  searchProfilesByNLP,
  getProfileById,
  getAllProfiles,
  deleteProfile,
  exportProfiles,
} from "../controllers/profileController.js";
import { authenticate } from "../middleware/auth.js";
import { requireAdmin, requireAnalyst } from "../middleware/rbac.js";
import { defaultRateLimiter } from "../middleware/rateLimit.js";
import { requireApiVersion } from "../middleware/versioning.js";
import { requestLogger } from "../middleware/logger.js";

const router = Router();

// Apply global middleware to all profile routes
router.use(requestLogger);
router.use(authenticate); // All profile endpoints require authentication
router.use(defaultRateLimiter); // Apply rate limiting
router.use(requireApiVersion); // Require API version header

// Routes accessible by both admin and analyst (read-only)
router.get("/search", requireAnalyst, searchProfilesByNLP);
router.get("/", requireAnalyst, getAllProfiles);
router.get("/export", requireAnalyst, exportProfiles);
router.get("/:id", requireAnalyst, getProfileById);

// Routes accessible only by admin (write/delete operations)
router.post("/", requireAdmin, createProfile);
router.post("/import", requireAdmin, importProfiles);
router.delete("/:id", requireAdmin, deleteProfile);

export default router;
