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
 * - Normal jump (< 5 levels): sends the standard level-up message for the
 *   final level reached.
 * - Large jump (≥ 5 levels): sends one summary message first, then the
 *   standard message for every intermediate level so each reward is visible.
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
    await channel
      .send(`🚀 <@${userId}> jumped from **Level ${oldLevel}** → **Level ${newLevel}**!`)
      .catch((err: unknown) => logger.error({ err }, "Failed to send jump summary"));

    for (let level = oldLevel + 1; level <= newLevel; level++) {
      await channel
        .send(buildLevelUpText(userId, level))
        .catch((err: unknown) => logger.error({ err, level }, "Failed to send intermediate level-up"));
    }
  } else {
    await channel
      .send(buildLevelUpText(userId, newLevel))
      .catch((err: unknown) => logger.error({ err }, "Failed to send level-up message"));
  }
}
