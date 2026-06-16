import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types.js";
import {
  getOrCreate,
  getRankByXp,
  getRankByWeeklyMessages,
  getRankByWeeklyVoice,
  countGuildMembers,
} from "../db/models/GuildMember.js";
import { levelFromXp, xpForNextLevel, xpInCurrentLevel } from "../config.js";

function formatVoice(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

export const rank: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("View your or another member's rank and stats")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Member to check (defaults to you)")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;

    // Fetch guild member for server display name; fall back to global username.
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.username;

    // Load (or create) stats and all rank data in parallel.
    const [stats, total] = await Promise.all([
      getOrCreate(guildId, target.id),
      countGuildMembers(guildId),
    ]);

    // Always derive level from XP — never trust the cached DB field.
    const xp = stats.xp ?? 0;
    const level = levelFromXp(xp);
    const xpInLevel = xpInCurrentLevel(xp);
    const xpNeeded = xpForNextLevel(level);

    const messages = stats.messages ?? 0;
    const weeklyMessages = stats.weeklyMessages ?? 0;
    const voiceMinutes = stats.voiceMinutes ?? 0;
    const weeklyVoiceMinutes = stats.weeklyVoiceMinutes ?? 0;

    const [rankXp, rankWeeklyMsg, rankWeeklyVoice] = await Promise.all([
      getRankByXp(guildId, target.id),
      getRankByWeeklyMessages(guildId, target.id),
      getRankByWeeklyVoice(guildId, target.id),
    ]);

    const embed = new EmbedBuilder()
      .setTitle(`${displayName}'s Stats`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0x5865f2)
      .addFields(
        { name: "Level", value: `**${level}**`, inline: true },
        { name: "Total XP", value: `**${xp.toLocaleString()}**`, inline: true },
        { name: "Rank", value: `**#${rankXp}** / ${total}`, inline: true },
        {
          name: "XP Progress",
          value: `${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} to level ${level + 1}`,
          inline: false,
        },
        {
          name: "Messages",
          value: [
            `All-time: **${messages.toLocaleString()}**`,
            `This week: **${weeklyMessages.toLocaleString()}** — rank **#${rankWeeklyMsg}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "Voice",
          value: [
            `All-time: **${formatVoice(voiceMinutes)}**`,
            `This week: **${formatVoice(weeklyVoiceMinutes)}** — rank **#${rankWeeklyVoice}**`,
          ].join("\n"),
          inline: true,
        },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
