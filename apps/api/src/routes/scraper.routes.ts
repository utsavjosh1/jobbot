import { Router } from "express";
import { ScraperController } from "../controllers/scraper.controller.js";

const router = Router();
const controller = new ScraperController();

router.get("/stats", controller.getStats);
router.get("/runs", controller.getRuns);

export default router;
