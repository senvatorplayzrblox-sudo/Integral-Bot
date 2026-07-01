import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";
import { errorReply } from "../../lib/reply.js";

export async function setbotchannel(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "You need **Administrator** permission to use this command.");
    return;
  }

  const channels = message.mentions.channels.map((c) => c.id);

  if (channels.length === 0) {
    await errorReply(
      message,
      "Please mention at least one channel.\nUsage: `&setbotchannel #channel1 [#channel2 ...]`",
    );
    return;
  }

  await updateGuildConfig(message.guildId!, { botChannelIds: channels });

  await message.reply(`✅ Bot commands are now restricted to ${channels.length} channel(s).`);
}
