import type { Message } from "discord.js";
import { updateGuildConfig } from "../../db/models/GuildConfig.js";

export async function setwelcomechannel(message: Message, args: string[]): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const channel = message.mentions.channels.first();

  if (!channel || !channel.isTextBased()) {
    await message.reply(
      "❌ Please mention a text channel.\nExample: `&setwelcomechannel #welcome`",
    );
    return;
  }

  await updateGuildConfig(message.guildId!, { welcomeChannelId: channel.id });

  await message.reply(`✅ Welcome channel has been set to ${channel}.`);
}
