import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { db, bot_configs, eq, and, sql } from "@postly/database";
import { logger } from "@postly/logger";
import { processGuildDispatch } from "./worker.js";
import { DISCORD_BOT_TOKEN, WEB_URL } from "../config/secrets.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Slash command definition – built once, reused across guild syncs
const SETUP_COMMAND: RESTPostAPIChatInputApplicationCommandsJSONBody =
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set the channel for daily Postly job drops")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("The channel where jobs should be posted")
        .setRequired(true),
    )
    .toJSON();

// ---------------------------------------------------------------------------
// Cache – O(1) lookup for active guild configs
// ---------------------------------------------------------------------------

interface GuildCacheEntry {
  channelId: string;
  configId: string;
}

const guildCache = new Map<string, GuildCacheEntry>();

async function refreshCache(): Promise<void> {
  const rows = await db
    .select({
      configId: bot_configs.id,
      guildId: bot_configs.target_id,
      channelId: bot_configs.platform_config,
    })
    .from(bot_configs)
    .where(
      and(
        eq(bot_configs.platform, "discord"),
        eq(bot_configs.is_active, true),
      ),
    );

  guildCache.clear();
  for (const row of rows) {
    const channelId =
      typeof row.channelId === "object" && row.channelId !== null
        ? (row.channelId as Record<string, unknown>).channel_id
        : null;
    if (row.guildId && channelId) {
      guildCache.set(row.guildId, {
        channelId: String(channelId),
        configId: row.configId,
      });
    }
  }
  logger.info("Discord guild cache refreshed", { entries: guildCache.size });
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function upsertChannel(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  // Atomically upsert the channel_id inside platform_config
  const [existing] = await db
    .select({ id: bot_configs.id })
    .from(bot_configs)
    .where(
      and(
        eq(bot_configs.platform, "discord"),
        eq(bot_configs.target_id, guildId),
      ),
    )
    .limit(1);

  if (!existing) return false;

  await db
    .update(bot_configs)
    .set({
      platform_config: sql`jsonb_set(
        COALESCE(platform_config, '{}'::jsonb),
        '{channel_id}',
        to_jsonb(${channelId}::text)
      )`,
      is_active: true,
      updated_at: new Date(),
    })
    .where(eq(bot_configs.id, existing.id));

  guildCache.set(guildId, { channelId, configId: existing.id });
  return true;
}

async function markInactive(guildId: string): Promise<void> {
  await db
    .update(bot_configs)
    .set({ is_active: false, updated_at: new Date() })
    .where(
      and(
        eq(bot_configs.platform, "discord"),
        eq(bot_configs.target_id, guildId),
      ),
    );
  guildCache.delete(guildId);
}

// ---------------------------------------------------------------------------
// Dispatch fallback – safety net every 6h at 9/15/21 UTC
// ---------------------------------------------------------------------------

let fallbackTimer: ReturnType<typeof setInterval> | null = null;

function scheduleFallbackDispatch(client: Client): void {
  // Check every hour, but only fire at the right windows
  fallbackTimer = setInterval(async () => {
    const hour = new Date().getUTCHours();
    if (hour !== 9 && hour !== 15 && hour !== 21) return;

    if (guildCache.size === 0) {
      await refreshCache();
    }

    logger.info("Fallback dispatch: checking guilds", {
      count: guildCache.size,
    });

    for (const [guildId, entry] of guildCache) {
      try {
        const channel = client.channels.cache.get(entry.channelId) as
          | TextChannel
          | undefined;
        if (channel) {
          await processGuildDispatch(guildId, entry.channelId, client);
        }
      } catch (err) {
        logger.error("Fallback dispatch error", {
          guildId,
          error: (err as Error).message,
        });
      }
      // Rate-limit between guilds
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }, 3_600_000); // Every hour

  logger.info("Fallback dispatch loop scheduled (every 1h, fires at 9/15/21 UTC)");
}

function stopFallbackDispatch(): void {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Discord Client
// ---------------------------------------------------------------------------

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    // Default caching — we rely on guild & channel caches for O(1) lookups
  });

  // ── Ready ────────────────────────────────────────────────────────────────
  client.once("ready", async () => {
    logger.info("Discord bot ready", {
      tag: client.user?.tag,
      guilds: client.guilds.cache.size,
    });

    // Register slash command globally
    try {
      await client.application!.commands.set([SETUP_COMMAND]);
      logger.info("Slash commands registered");
    } catch (err) {
      logger.error("Failed to register slash commands", {
        error: (err as Error).message,
      });
    }

    // Warm cache
    await refreshCache();

    // Start fallback
    scheduleFallbackDispatch(client);
  });

  // ── Interaction (slash commands) ─────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction as ChatInputCommandInteraction;
    if (cmd.commandName !== "setup") return;

    // Permission check
    const member = cmd.member;
    const hasPerm =
      member !== null &&
      "permissions" in member &&
      typeof member.permissions === "object" &&
      member.permissions !== null &&
      "has" in member.permissions &&
      typeof (member.permissions as { has: unknown }).has === "function"
        ? (member.permissions as { has: (perm: bigint) => boolean }).has(
            PermissionFlagsBits.ManageGuild,
          )
        : false;

    if (!hasPerm) {
      await cmd.reply({
        content:
          "\u274c You need 'Manage Server' permissions to do this.",
        ephemeral: true,
      });
      return;
    }

    const channel = cmd.options.getChannel("channel", true) as TextChannel;
    const guildId = cmd.guildId!;

    const updated = await upsertChannel(guildId, channel.id);

    if (updated) {
      await cmd.reply(
        `\u2705 Success! Daily jobs will now be posted in ${channel}.`,
      );
    } else {
      const magicLink = `${WEB_URL}/integrations?guild_id=${guildId}`;
      await cmd.reply({
        content:
          "\u274c **Server Not Linked**\n\n" +
          "This server needs to be connected to your Postly account before you can configure it.\n\n" +
          `\u{1f449} **[Click here to link this server](${magicLink})**`,
        ephemeral: true,
      });
    }
  });

  // ── Guild remove (kicked / left) ─────────────────────────────────────────
  client.on("guildDelete", async (guild) => {
    logger.info("Bot removed from guild, marking inactive", {
      guildId: guild.id,
    });
    await markInactive(guild.id);
  });

  return client;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function startDiscordBot(): Promise<Client> {
  const token = DISCORD_BOT_TOKEN;
  if (!token || token.length < 50) {
    throw new Error(
      "DISCORD_BOT_TOKEN is missing or too short. Cannot start Discord bot.",
    );
  }

  const client = createDiscordClient();
  await client.login(token);
  return client;
}

export { guildCache };
