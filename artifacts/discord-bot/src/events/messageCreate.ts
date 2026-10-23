import prefixHandler from "../prefix/handler.js";
import type { Message } from "discord.js";
import { logger } from "../lib/logger.js";
import { getOrCreate, save } from "../db/models/GuildMember.js";
import { config, levelFromXp } from "../config.js";
import { getGuildConfig } from "../utils/getGuildConfig.js";
import { applyLevelRoles } from "../lib/levelRoles.js";
import { sendLevelUpNotification } from "../lib/levelUp.js";
import { calculateBoostedXp, getActiveXpMultiplier } from "../lib/xpEvent.js";

export default async function onMessageCreate(message: Message): Promise<void> {
  if (await prefixHandler(message)) return;
  if (message.author.bot || !message.inGuild()) return;

  const guildId = message.guildId;
  const userId = message.author.id;
  const now = new Date();

  const stats = await getOrCreate(guildId, userId);
  stats.messages++;
  stats.weeklyMessages++;

  const msSinceLastXP = now.getTime() - stats.lastMessageXP.getTime();
  const onCooldown = msSinceLastXP < config.xp.cooldownSeconds * 1000;

  if (!onCooldown) {
    const baseGained =
      Math.floor(
        Math.random() * (config.xp.maxPerMessage - config.xp.minPerMessage + 1),
      ) + config.xp.minPerMessage;
    const multiplier = await getActiveXpMultiplier(message.client, guildId);
    const gained = calculateBoostedXp(baseGained, multiplier);

    const oldLevel = stats.level;
    stats.xp += gained;
    stats.level = levelFromXp(stats.xp);
    stats.lastMessageXP = now;

    if (stats.level > oldLevel) {
      const guildConfig = await getGuildConfig(message.guildId!);
      const member = await message.guild.members.fetch(message.author.id);
      await applyLevelRoles(message.guild, member, oldLevel, stats.level, guildConfig);
      await sendLevelUpNotification(
        message.guild,
        message.author.id,
        oldLevel,
        stats.level,
        guildConfig,
        message.channelId,
      );
    }
  }

  await save(stats);
}
