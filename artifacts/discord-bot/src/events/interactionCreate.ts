import type { Interaction } from "discord.js";
import { logger } from "../lib/logger.js";
import type { IntegralClient } from "../client.js";

export default async function onInteractionCreate(
  client: IntegralClient,
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn({ commandName: interaction.commandName }, "Unknown command received");
    await interaction.reply({ content: "Unknown command.", ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error({ err, commandName: interaction.commandName }, "Command execution error");
    const payload = { content: "Something went wrong while running that command.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}
