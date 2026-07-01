import { EmbedBuilder, type Message } from "discord.js";

/**
 * Replies to a prefix command with a standardised error embed.
 * Usage: await errorReply(message, "You need Administrator permission.");
 */
export async function errorReply(message: Message, text: string): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setDescription(`❌  ${text}`);

  await message.reply({ embeds: [embed] });
}
