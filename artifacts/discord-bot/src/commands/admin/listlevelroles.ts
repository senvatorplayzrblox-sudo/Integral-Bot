import type { Message } from "discord.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { errorReply, infoReply, warningReply } from "../../lib/reply.js";

export async function listlevelroles(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  const config = await getGuildConfig(message.guildId!);
  const roles  = config.levelRoles ?? {};

  if (Object.keys(roles).length === 0) {
    await warningReply(
      message,
      "No Level Roles Configured",
      "Use `&setlevelrole <level> @Role` to add your first one.",
    );
    return;
  }

  const lines = Object.entries(roles)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, roleId]) => `**Level ${level}** → <@&${roleId}>`);

  await infoReply(message, "Level Roles", lines.join("\n"));
}
