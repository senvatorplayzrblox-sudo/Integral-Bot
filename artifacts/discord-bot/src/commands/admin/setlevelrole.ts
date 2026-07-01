import type { Message } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../../db/models/GuildConfig.js";

export async function setlevelrole(
  message: Message,
  args: string[],
): Promise<void> {

  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const level = Number(args[0]);
  const role = message.mentions.roles.first();

  if (!level || !role) {
    await message.reply(
      "❌ Use: `&setlevelrole 10 @Role`"
    );
    return;
  }

  const config = await getGuildConfig(message.guildId!);

  await updateGuildConfig(message.guildId!, {
    levelRoles: {
      ...config.levelRoles,
      [level]: role.id,
    },
  });

  await message.reply(
    `✅ Level ${level} role set to ${role}.`
  );
}