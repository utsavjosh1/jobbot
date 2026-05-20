import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { JobController } from "../controllers/job.controller.js";

const router = Router();
const jobController = new JobController();

router.get("/", jobController.getJobs);

router.use(authenticateToken);
router.get("/matches", jobController.getMatches);
router.get("/saved", jobController.getSavedMatches);
router.post("/matches/:jobId/save", jobController.saveMatch);
router.delete("/matches/:jobId/save", jobController.unsaveMatch);
router.post("/matches/:jobId/apply", jobController.markAsApplied);
router.get("/:id", jobController.getJobById);

export default router;
