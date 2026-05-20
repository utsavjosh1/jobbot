import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { BotController } from "../controllers/bot.controller.js";

const router = Router();
const botController = new BotController();

router.get("/discord/callback", authenticateToken, botController.handleDiscordCallback);
router.use(authenticateToken);
router.get("/configs", botController.getConfigs);
router.post("/configs", botController.upsertConfig);
router.patch("/configs/:id", botController.updateConfig);
router.post("/configs/:id/test", botController.triggerTestNotification);

export default router;
