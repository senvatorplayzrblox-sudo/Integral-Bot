import type { Message } from "discord.js";
import { getOrCreate, save } from "../../db/models/GuildMember.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { levelFromXp } from "../../config.js";
import { applyLevelRoles } from "../../lib/levelRoles.js";
import { errorReply } from "../../lib/reply.js";

export async function givexp(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "You need **Administrator** permission to use this command.");
    return;
  }

  const target = message.mentions.users.first();
  const amount = Number(args[1]);

  if (!target || !amount || amount <= 0) {
    await errorReply(message, "Invalid arguments.\nUsage: `&givexp @user <amount>`");
    return;
  }

  const stats = await getOrCreate(message.guildId!, target.id);

  const oldLevel = stats.level;
  stats.xp += amount;
  stats.level = levelFromXp(stats.xp);

  await save(stats);

  if (stats.level > oldLevel && message.guild) {
    const guildConfig = await getGuildConfig(message.guildId!);
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      await applyLevelRoles(message.guild, member, oldLevel, stats.level, guildConfig);
    }
  }

  await message.reply(`✅ Added **${amount} XP** to ${target}.\nLevel: **${stats.level}**`);
}
