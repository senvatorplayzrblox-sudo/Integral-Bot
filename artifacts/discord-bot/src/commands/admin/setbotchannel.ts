import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";

export async function setbotchannel(
  message: Message,
  args: string[],
): Promise<void> {

  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const channels = message.mentions.channels.map(c => c.id);

  if (channels.length === 0) {
    await message.reply(
      "❌ Mention channels.\nExample: `!setbotchannel #bot #commands #chat`",
    );
    return;
  }


  await updateGuildConfig(message.guildId!, {
    botChannelIds: channels,
  });


  await message.reply(
    `✅ Bot commands are now allowed in ${channels.length} channels.`,
  );
}