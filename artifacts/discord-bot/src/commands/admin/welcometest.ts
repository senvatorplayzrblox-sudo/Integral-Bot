import type { Message } from "discord.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { sendWelcomeMessage } from "../../lib/welcome.js";

export async function welcometest(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  if (!message.inGuild()) return;

  const guildId = message.guildId;
  const config = await getGuildConfig(guildId);

  if (!config.welcomeTitle && !config.welcomeDescription) {
    await message.reply(
      "❌ No welcome message configured yet. Run `&welcomesetup` to set one up.",
    );
    return;
  }

  // Use the mentioned member, or fall back to the command executor.
  const targetMember = message.mentions.members?.first() ?? message.member;

  await sendWelcomeMessage(config, targetMember, message.channel);
}
