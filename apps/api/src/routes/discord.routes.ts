import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken } from "../middleware/auth.js";
import { DiscordController } from "../controllers/discord.controller.js";

const router = Router();
const discordController = new DiscordController();

const discordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(discordRateLimiter);
router.use(authenticateToken);

router.get("/callback", discordController.handleCallback);
router.get("/configs", discordController.getConfigs);
router.patch("/configs/:id", discordController.updateConfig);
router.post("/test-notification", discordController.triggerTestNotification);
router.post("/link-server", discordController.linkServer);

export default router;
