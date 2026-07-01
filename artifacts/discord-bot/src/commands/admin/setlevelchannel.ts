import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";
import { errorReply, successReply } from "../../lib/reply.js";

export async function setlevelchannel(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  const channel = message.mentions.channels.first();

  if (!channel || !channel.isTextBased()) {
    await errorReply(
      message,
      "Invalid Arguments",
      "Please mention a text channel.\nUsage: `&setlevelchannel #channel`",
    );
    return;
  }

  await updateGuildConfig(message.guildId!, { levelChannelId: channel.id });

  await successReply(
    message,
    "Level Channel Set",
    `Level-up messages will now be sent in ${channel}.`,
  );
}
