import { Request, Response, NextFunction } from "express";
import { db, discord_configs, eq, and } from "@postly/database";
import { queueService } from "../services/queue.service.js";
import type { JwtPayload } from "../middleware/auth.js";
import { WEB_URL } from "../config/secrets.js";

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

export class DiscordController {
  handleCallback = async (
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> => {
    try {
      const { guild_id } = req.query;
      if (!guild_id) {
        res.status(400).json({
          success: false,
          error: { message: "Missing guild_id from Discord callback" },
        });
        return;
      }
      await db
        .insert(discord_configs)
        .values({
          guild_id: guild_id as string,
          user_id: userFromRequest(req),
          is_active: true,
        })
        .onConflictDoUpdate({
          target: discord_configs.guild_id,
          set: {
            user_id: userFromRequest(req),
            is_active: true,
            updated_at: new Date(),
          },
        });
      res.redirect(
        `${WEB_URL}/dashboard?discord_success=true&guild_id=${guild_id}`,
      );
    } catch (error) {
      console.error("Discord callback error:", error);
      res.redirect(`${WEB_URL}/dashboard?discord_error=true`);
    }
  };

  getConfigs = async (
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> => {
    try {
      const configs = await db
        .select()
        .from(discord_configs)
        .where(eq(discord_configs.user_id, userFromRequest(req)));
      res.json({ success: true, configs });
    } catch (error) {
      _next(error);
    }
  };

  triggerTestNotification = async (
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> => {
    try {
      const [config] = await db
        .select()
        .from(discord_configs)
        .where(
          and(
            eq(discord_configs.user_id, userFromRequest(req)),
            eq(discord_configs.is_active, true),
          ),
        )
        .limit(1);
      if (!config || !config.channel_id) {
        res.status(404).json({
          success: false,
          message: "No active Discord configuration found. Run /setup first!",
        });
        return;
      }
      await queueService.dispatchForGuild(config.guild_id, config.channel_id);
      res.json({
        success: true,
        message: "Test notification queued successfully!",
      });
    } catch (error) {
      _next(error);
    }
  };

  updateConfig = async (
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> => {
    try {
      const { channel_id, is_active } = req.body;
      await db
        .update(discord_configs)
        .set({ channel_id, is_active, updated_at: new Date() })
        .where(
          and(
            eq(discord_configs.id, req.params.id as string),
            eq(discord_configs.user_id, userFromRequest(req)),
          ),
        );
      res.json({
        success: true,
        message: "Configuration updated successfully",
      });
    } catch (error) {
      _next(error);
    }
  };

  linkServer = async (
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> => {
    try {
      const { guild_id } = req.body;
      if (!guild_id) {
        res
          .status(400)
          .json({ success: false, error: { message: "Missing guild_id" } });
        return;
      }
      await db
        .insert(discord_configs)
        .values({
          guild_id: guild_id as string,
          user_id: userFromRequest(req),
          is_active: true,
        })
        .onConflictDoUpdate({
          target: discord_configs.guild_id,
          set: {
            user_id: userFromRequest(req),
            is_active: true,
            updated_at: new Date(),
          },
        });
      res.json({ success: true, message: "Server linked successfully!" });
    } catch (error) {
      _next(error);
    }
  };
}
