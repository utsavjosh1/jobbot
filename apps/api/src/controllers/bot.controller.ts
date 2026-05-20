import { Request, Response, NextFunction } from "express";
import { db, bot_configs, eq, and, botQueries } from "@postly/database";
import { queueService } from "../services/queue.service.js";
import type { JwtPayload } from "../middleware/auth.js";
import { WEB_URL } from "../config/secrets.js";
import type { BotPlatform } from "@postly/shared-types";

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

export class BotController {
  handleDiscordCallback = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { guild_id } = req.query;
      if (!guild_id) { res.redirect(`${WEB_URL}/dashboard?discord_error=missing_guild`); return; }
      await botQueries.upsertConfig({ user_id: userFromRequest(req), platform: "discord", target_id: guild_id as string });
      res.redirect(`${WEB_URL}/dashboard?discord_success=true&guild_id=${guild_id}`);
    } catch (error) {
      console.error("Discord callback error:", error);
      res.redirect(`${WEB_URL}/dashboard?discord_error=true`);
    }
  };

  getConfigs = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const configs = await db.select().from(bot_configs).where(eq(bot_configs.user_id, userFromRequest(req)));
      res.json({ success: true, data: configs });
    } catch (error) { _next(error); }
  };

  upsertConfig = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { platform, target_id, target_name, webhook_url, credentials, filters } = req.body;
      const result = await botQueries.upsertConfig({
        user_id: userFromRequest(req), platform: platform as BotPlatform,
        target_id, target_name, webhook_url, credentials, ...filters,
      });
      res.json({ success: true, data: result });
    } catch (error) { _next(error); }
  };

  updateConfig = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const [existing] = await db.select().from(bot_configs).where(and(eq(bot_configs.id, req.params.id), eq(bot_configs.user_id, userId))).limit(1);
      if (!existing) { res.status(404).json({ success: false, message: "Config not found" }); return; }
      const [updated] = await db.update(bot_configs).set({ ...req.body, updated_at: new Date() }).where(eq(bot_configs.id, req.params.id)).returning();
      res.json({ success: true, data: updated });
    } catch (error) { _next(error); }
  };

  triggerTestNotification = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const [config] = await db.select().from(bot_configs).where(and(eq(bot_configs.id, req.params.id), eq(bot_configs.user_id, userId))).limit(1);
      if (!config) { res.status(404).json({ success: false, message: "Bot configuration not found." }); return; }
      await queueService.dispatchForPlatform(config.id);
      res.json({ success: true, message: `Test notification queued for ${config.platform}!` });
    } catch (error) { _next(error); }
  };
}
