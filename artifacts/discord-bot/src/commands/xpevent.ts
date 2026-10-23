import { PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types.js";
import { openXpEventAdminPanel } from "../lib/xpEvent.js";

export const xpevent: Command = {
  data: new SlashCommandBuilder()
    .setName("xpevent")
    .setDescription("Open the administrator XP event panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await openXpEventAdminPanel(interaction);
  },
};
