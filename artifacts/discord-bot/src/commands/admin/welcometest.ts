import type { Message } from "discord.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { sendWelcomeMessage } from "../../lib/welcome.js";
import { errorReply } from "../../lib/reply.js";

export async function welcometest(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to use this command.");
    return;
  }

  if (!message.inGuild()) return;

  const config = await getGuildConfig(message.guildId);

  if (!config.welcomeTitle && !config.welcomeDescription) {
    await errorReply(
      message,
      "Not Configured",
      "No welcome message has been set up yet.\nRun `&welcomesetup` to configure one.",
    );
    return;
  }

  const targetMember = message.mentions.members?.first() ?? message.member;
  await sendWelcomeMessage(config, targetMember, message.channel);
}
