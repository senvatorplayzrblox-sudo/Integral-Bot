import { getGuildConfig } from "../db/models/GuildConfig.js";
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
    const guildConfig = await getGuildConfig(interaction.guildId!);

if (
  guildConfig.botChannelId &&
  interaction.channelId !== guildConfig.botChannelId
) {
  await interaction.reply({
    content: `❌ Use bot commands in <#${guildConfig.botChannelId}>`,
    ephemeral: true,
  });
  return;
}
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

    const percent = Math.min(
  100,
  Math.round((xpInLevel / xpNeeded) * 1000) / 10
);

    const filled = Math.round(percent / 10);
    const progressBar =
      "█".repeat(filled) +
      "░".repeat(10 - filled);
    const content =
`## 📊 **∫ ${displayName}'s Stats**
**Level ${level}** • \`${xpInLevel} / ${xpNeeded} XP\` • \`${percent}%\`
${progressBar}

**🏆 Leaderboard Rank:** \`#${rankXp}\`
**📅 Weekly Rank:** \`💬 #${rankWeeklyMsg}\` • \`🎙️ #${rankWeeklyVoice}\``;

    await interaction.editReply({
      content,
    });
  },
};
