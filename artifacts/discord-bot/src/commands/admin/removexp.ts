import type { Message } from "discord.js";
import { getOrCreate, save } from "../../db/models/GuildMember.js";
import { levelFromXp } from "../../config.js";
import { errorReply, successReply } from "../../lib/reply.js";

export async function removexp(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  const target = message.mentions.users.first();
  const amount = Number(args[1]);

  if (!target || !amount || amount <= 0) {
    await errorReply(message, "Invalid Arguments", "Usage: `&removexp @user <amount>`");
    return;
  }

  const stats = await getOrCreate(message.guildId!, target.id);

  stats.xp    = Math.max(0, stats.xp - amount);
  stats.level = levelFromXp(stats.xp);

  await save(stats);

  await successReply(
    message,
    "XP Removed",
    `Removed **${amount} XP** from ${target}.\nThey are now **Level ${stats.level}**.`,
  );
}
