import type { Message } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../../db/models/GuildConfig.js";
import { errorReply, successReply } from "../../lib/reply.js";

export async function setlevelrole(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  const level = Number(args[0]);
  const role  = message.mentions.roles.first();

  if (!level || !role) {
    await errorReply(message, "Invalid Arguments", "Usage: `&setlevelrole <level> @Role`");
    return;
  }

  const config = await getGuildConfig(message.guildId!);

  await updateGuildConfig(message.guildId!, {
    levelRoles: { ...config.levelRoles, [level]: role.id },
  });

  await successReply(
    message,
    "Level Role Set",
    `Reaching **Level ${level}** will now grant ${role}.`,
  );
}
