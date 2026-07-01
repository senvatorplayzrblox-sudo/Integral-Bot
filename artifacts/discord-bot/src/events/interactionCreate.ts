import { EmbedBuilder, type Interaction } from "discord.js";
import { logger } from "../lib/logger.js";
import type { IntegralClient } from "../client.js";
import { getGuildConfig } from "../db/models/GuildConfig.js";
import { handleWelcomeInteraction } from "../lib/welcome.js";

export default async function onInteractionCreate(
  client: IntegralClient,
  interaction: Interaction,
): Promise<void> {

  // Route welcome-system buttons and modals before anything else
  if (
    (interaction.isButton() || interaction.isModalSubmit()) &&
    interaction.customId.startsWith("ws_")
  ) {
    try {
      await handleWelcomeInteraction(interaction);
    } catch (err) {
      logger.error({ err, customId: interaction.customId }, "Welcome interaction error");
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    logger.warn(
      { commandName: interaction.commandName },
      "Unknown command received",
    );

    await interaction.reply({
      content: "Unknown command.",
      ephemeral: true,
    });

    return;
  }

  const guildConfig = await getGuildConfig(interaction.guildId!);

  if (
    guildConfig.botChannelIds &&
    guildConfig.botChannelIds.length > 0
  ) {

    if (
      !guildConfig.botChannelIds.includes(
        interaction.channelId,
      )
    ) {

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("❌ Wrong Channel")
        .setDescription(
          `Bot commands can only be used in:\n\n${guildConfig.botChannelIds
            .map(id => `<#${id}>`)
            .join("\n")}`,
        );

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });

      return;
    }
  }

  try {

    await command.execute(interaction);

  } catch (err) {

    logger.error(
      {
        err,
        commandName: interaction.commandName,
      },
      "Command execution error",
    );

    const payload = {
      content: "Something went wrong while running that command.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}