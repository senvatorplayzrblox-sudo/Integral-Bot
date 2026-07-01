import type { Guild, GuildTextBasedChannel } from "discord.js";
import type { GuildConfig } from "../db/models/GuildConfig.js";
import { logger } from "./logger.js";

// ── Level-up message builder ───────────────────────────────────────────────

function buildLevelUpText(userId: string, level: number): string {
  return (
    `> <:globe:1516671809666158622> <@${userId}> Congratulations! You Just Reached **Level ${level}**!\n` +
    `> \n` +
    `> <:shine:1516672794069438515> Keep Grinding To Earn More XP And Climb Higher On The Leaderboards.\n` +
    `> \n` +
    `> <:acheiver:1516671562365931530> Stay Active To Unlock More Milestones And Reach Level ${level + 1}!`
  );
}

// ── Shared notification entry point ───────────────────────────────────────

/**
 * Sends level-up notification(s) to the configured level channel.
 *
 * - Normal jump (< 5 levels): sends one standard level-up message for the
 *   final level reached.
 * - Large jump (≥ 5 levels): sends ONE summary message only.
 *   "🚀 jumped from Level X → Level Y!"
 *   Individual per-level messages are NOT sent to prevent spam.
 *   All intermediate role rewards are still granted separately via applyLevelRoles.
 *
 * Falls back to `fallbackChannelId` when no level channel is configured
 * (e.g. for message-based XP where the source channel is known).
 */
export async function sendLevelUpNotification(
  guild: Guild,
  userId: string,
  oldLevel: number,
  newLevel: number,
  guildConfig: GuildConfig,
  fallbackChannelId?: string,
): Promise<void> {
  const jump = newLevel - oldLevel;
  if (jump <= 0) return;

  const channelId = guildConfig.levelChannelId ?? fallbackChannelId ?? null;
  if (!channelId) return;

  const raw = guild.channels.cache.get(channelId);
  if (!raw?.isTextBased()) return;

  const channel = raw as GuildTextBasedChannel;

  if (jump >= 5) {
    // Large jump: ONE summary message only — no per-level spam.
    // Roles are granted by applyLevelRoles, not here.
    await channel
      .send(`🚀 <@${userId}> jumped from **Level ${oldLevel}** → **Level ${newLevel}**!`)
      .catch((err: unknown) => logger.error({ err }, "Failed to send jump summary"));
  } else {
    // Normal jump: one message for the final level reached.
    await channel
      .send(buildLevelUpText(userId, newLevel))
      .catch((err: unknown) => logger.error({ err }, "Failed to send level-up message"));
  }
}
