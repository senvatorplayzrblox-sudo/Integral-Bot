import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

    const [stats, total] = await Promise.all([
      getOrCreate(guildId, target.id),
      countGuildMembers(guildId),
    ]);

    const level = levelFromXp(stats.xp);
    const xpInLevel = xpInCurrentLevel(stats.xp);
    const xpNeeded = xpForNextLevel(level);

    const [rankXp, rankWeeklyMsg, rankWeeklyVoice] = await Promise.all([
      getRankByXp(guildId, target.id),
      getRankByWeeklyMessages(guildId, target.id),
      getRankByWeeklyVoice(guildId, target.id),
    ]);

    const lines = [
      `**${target.displayName}**`,
      ``,
      `Level  **${level}**`,
      `XP     **${stats.xp.toLocaleString()}** total  ·  ${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} to level ${level + 1}`,
      `Rank   **#${rankXp}** / ${total}`,
      ``,
      `Messages (all-time)    **${stats.messages.toLocaleString()}**`,
      `Messages (this week)   **${stats.weeklyMessages.toLocaleString()}**  ·  rank #${rankWeeklyMsg}`,
      ``,
      `Voice (all-time)       **${formatVoice(stats.voiceMinutes)}**`,
      `Voice (this week)      **${formatVoice(stats.weeklyVoiceMinutes)}**  ·  rank #${rankWeeklyVoice}`,
    ];

    await interaction.editReply({ content: `\`\`\`\n${lines.join("\n")}\n\`\`\`` });
  },
};
