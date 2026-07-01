import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";
import { errorReply, successReply } from "../../lib/reply.js";

export async function setbotchannel(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  const channels = message.mentions.channels.map((c) => c.id);

  if (channels.length === 0) {
    await errorReply(
      message,
      "Invalid Arguments",
      "Please mention at least one channel.\nUsage: `&setbotchannel #channel1 [#channel2 ...]`",
    );
    return;
  }

  await updateGuildConfig(message.guildId!, { botChannelIds: channels });

  const channelList = channels.map((id) => `<#${id}>`).join(", ");
  await successReply(
    message,
    "Bot Channels Updated",
    `Bot commands are now restricted to: ${channelList}`,
  );
}
