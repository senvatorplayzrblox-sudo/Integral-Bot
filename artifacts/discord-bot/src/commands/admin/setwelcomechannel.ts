import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";
import { errorReply, successReply } from "../../lib/reply.js";

export async function setwelcomechannel(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  const channel = message.mentions.channels.first();

  if (!channel || !channel.isTextBased()) {
    await errorReply(
      message,
      "Invalid Arguments",
      "Please mention a text channel.\nUsage: `&setwelcomechannel #welcome`",
    );
    return;
  }

  await updateGuildConfig(message.guildId!, { welcomeChannelId: channel.id });

  await successReply(
    message,
    "Welcome Channel Set",
    `Welcome messages will now be sent in ${channel}.`,
  );
}
