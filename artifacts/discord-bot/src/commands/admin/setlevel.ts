import type { Message } from "discord.js";
import { getOrCreate, save } from "../../db/models/GuildMember.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { xpForNextLevel } from "../../config.js";
import { applyLevelRoles } from "../../lib/levelRoles.js";
import { errorReply } from "../../lib/reply.js";

export async function setlevel(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "You need **Administrator** permission to use this command.");
    return;
  }

  const target = message.mentions.users.first();
  const level = Number(args[1]);

  if (!target || isNaN(level) || level < 0) {
    await errorReply(message, "Invalid arguments.\nUsage: `&setlevel @user <level>`");
    return;
  }

  const stats = await getOrCreate(message.guildId!, target.id);
  const oldLevel = stats.level;

  let xp = 0;
  for (let i = 0; i < level; i++) {
    xp += xpForNextLevel(i);
  }

  stats.xp = xp;
  stats.level = level;

  await save(stats);

  if (level > oldLevel && message.guild) {
    const guildConfig = await getGuildConfig(message.guildId!);
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      await applyLevelRoles(message.guild, member, oldLevel, level, guildConfig);
    }
  }

  await message.reply(`✅ Set ${target}'s level to **${level}**.`);
}
