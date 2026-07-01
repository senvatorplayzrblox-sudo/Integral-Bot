import prefixHandler from "../prefix/handler.js";
import type { Message } from "discord.js";
import { logger } from "../lib/logger.js";
import { getOrCreate, save } from "../db/models/GuildMember.js";
import { config, levelFromXp } from "../config.js";
import { getGuildConfig } from "../utils/getGuildConfig.js";
import { applyLevelRoles } from "../lib/levelRoles.js";
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
const gained =
Math.floor(
Math.random() * (config.xp.maxPerMessage - config.xp.minPerMessage + 1),
) + config.xp.minPerMessage;

const oldLevel = stats.level;
stats.xp += gained;
stats.level = levelFromXp(stats.xp);
stats.lastMessageXP = now;

if (stats.level > oldLevel) {
  const guildConfig = await getGuildConfig(message.guildId!);
  const member = await message.guild.members.fetch(message.author.id);
  await applyLevelRoles(message.guild, member, oldLevel, stats.level, guildConfig);
  await sendLevelUp(message, stats.level);
}

}

await save(stats);
}

async function sendLevelUp(message: Message, newLevel: number): Promise<void> {
  const text =
  `> <:globe:1516671809666158622> ${message.author} Congratulations! You Just Reached **Level ${newLevel}**!

  <:shine:1516672794069438515> Keep Grinding In <#1508093901838483536> To Earn More XP And Climb Higher On The Leaderboards.

  <:acheiver:1516671562365931530> Stay Active To Unlock More Milestones And Reach Level ${newLevel + 1}!`;
  try {
  const guildConfig = await getGuildConfig(message.guildId!);
    const channelId = guildConfig.levelChannelId;
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
