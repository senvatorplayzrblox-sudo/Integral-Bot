import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../types.js";
import { updateGuildConfig } from "../db/models/GuildConfig.js";
import { makeEmbed } from "../lib/reply.js";

export const setup: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup Integral bot channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("bot-channel")
        .setDescription("Set bot command channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for bot commands")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("level-channel")
        .setDescription("Set level up message channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for level messages")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const sub     = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel("channel");

    if (!channel) {
      await interaction.reply({
        embeds: [makeEmbed("error", "Missing Channel", "Please specify a channel.")],
        ephemeral: true,
      });
      return;
    }

    if (sub === "bot-channel") {
      await updateGuildConfig(guildId, { botChannelIds: [channel.id] });
      await interaction.reply({
        embeds: [makeEmbed("success", "Bot Channel Set", `Bot command channel set to <#${channel.id}>.`)],
        ephemeral: true,
      });
    }

    if (sub === "level-channel") {
      await updateGuildConfig(guildId, { levelChannelId: channel.id });
      await interaction.reply({
        embeds: [makeEmbed("success", "Level Channel Set", `Level-up messages will be sent in <#${channel.id}>.`)],
        ephemeral: true,
      });
    }
  },
};
