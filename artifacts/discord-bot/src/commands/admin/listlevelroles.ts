import type { Message } from "discord.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";

export async function listlevelroles(
  message: Message,
): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
  await message.reply(
    "❌ You need Administrator permission."
  );
  return;
  }

  const config = await getGuildConfig(message.guildId!);

  const roles = config.levelRoles ?? {};

  if (Object.keys(roles).length === 0) {
    await message.reply("❌ No level roles configured.");
    return;
  }

  const lines = Object.entries(roles)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, roleId]) => `Level ${level} → <@&${roleId}>`);

  await message.reply({
    content:
      `📜 **Configured Level Roles**\n\n${lines.join("\n")}`,
  });
}