import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";

export async function setlevelchannel(
  message: Message,
  args: string[],
): Promise<void> {

  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const channel = message.mentions.channels.first();

  if (!channel) {
    await message.reply("❌ Mention a channel.\nExample: `!setlevelchannel #levels`");
    return;
  }

  await updateGuildConfig(message.guildId!, {
    levelChannelId: channel.id,
  });

  await message.reply(
    `✅ Level up messages will be sent in ${channel}.`,
  );
}