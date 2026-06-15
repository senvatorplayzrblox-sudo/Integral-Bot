import type { Message } from "discord.js";
import { logger } from "../lib/logger.js";
import { getOrCreate, save } from "../db/models/GuildMember.js";
import { config, levelFromXp, xpForNextLevel } from "../config.js";

const xpCooldowns = new Map<string, number>();

export default async function onMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.inGuild()) return;

  const guildId = message.guildId;
  const userId = message.author.id;
  const now = Date.now();
  const cooldownKey = `${guildId}:${userId}`;

  const stats = await getOrCreate(guildId, userId);
  stats.messages++;
  stats.weeklyMessages++;

  const lastXpAt = xpCooldowns.get(cooldownKey) ?? 0;
  const onCooldown = now - lastXpAt < config.xp.cooldownSeconds * 1000;

  if (!onCooldown) {
    const gained =
      Math.floor(
        Math.random() * (config.xp.maxPerMessage - config.xp.minPerMessage + 1),
      ) + config.xp.minPerMessage;

    xpCooldowns.set(cooldownKey, now);

    const oldLevel = stats.level;
    stats.xp += gained;
    const newLevel = levelFromXp(stats.xp);

    if (newLevel > oldLevel) {
      stats.level = newLevel;
      await sendLevelUp(message, newLevel);
    }
  }

  stats.lastMessageTimestamp = now;
  await save(stats);
}

async function sendLevelUp(message: Message, newLevel: number): Promise<void> {
  const xpNeeded = xpForNextLevel(newLevel);
  const text =
    `**${message.author.displayName}** reached **level ${newLevel}**! ` +
    `(${xpNeeded.toLocaleString()} XP needed for level ${newLevel + 1})`;

  try {
    const channelId = config.levelChannel;
    if (channelId) {
      const ch = message.guild?.channels.cache.get(channelId);
      if (ch?.isTextBased()) {
        await ch.send(text);
        return;
      }
    }
    if ("send" in message.channel) {
      await (message.channel as { send(c: string): Promise<unknown> }).send(text);
    }
  } catch (err) {
    logger.error({ err }, "Failed to send level-up message");
  }
}
