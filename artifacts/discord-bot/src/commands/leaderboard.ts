import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../types.js";
import type { UserStats } from "../db/models/GuildMember.js";
import {
  getTopByMessages,
  getTopByVoice,
  getTopByWeeklyMessages,
  getTopByWeeklyVoice,
  getTopByXp,
} from "../db/models/GuildMember.js";

const PAGE_SIZE = 10;
const MAX_PAGES = 10;

type Category = "levels" | "messages" | "voice" | "weekly-messages" | "weekly-voice";

const CATEGORY_LABELS: Record<Category, string> = {
  levels: "Levels",
  messages: "All-Time Messages",
  voice: "All-Time Voice",
  "weekly-messages": "Weekly Messages",
  "weekly-voice": "Weekly Voice",
};

async function fetchPage(guildId: string, category: Category, page: number): Promise<UserStats[]> {
  const offset = page * PAGE_SIZE;
  switch (category) {
    case "levels":
      return getTopByXp(guildId, PAGE_SIZE, offset);
    case "messages":
      return getTopByMessages(guildId, PAGE_SIZE, offset);
    case "voice":
      return getTopByVoice(guildId, PAGE_SIZE, offset);
    case "weekly-messages":
      return getTopByWeeklyMessages(guildId, PAGE_SIZE, offset);
    case "weekly-voice":
      return getTopByWeeklyVoice(guildId, PAGE_SIZE, offset);
  }
}

function formatRow(stats: UserStats, rank: number, category: Category): string {
  const n = String(rank).padStart(3, " ");
  switch (category) {
    case "levels":
      return `${n}. ${stats.userId.padEnd(20)} Lv ${String(stats.level).padStart(3)}  ${stats.xp.toLocaleString()} XP`;
    case "messages":
      return `${n}. ${stats.userId.padEnd(20)} ${stats.messages.toLocaleString()} msgs`;
    case "voice": {
      const h = Math.floor(stats.voiceMinutes / 60);
      const m = stats.voiceMinutes % 60;
      return `${n}. ${stats.userId.padEnd(20)} ${h > 0 ? `${h}h ${m}m` : `${m}m`}`;
    }
    case "weekly-messages":
      return `${n}. ${stats.userId.padEnd(20)} ${stats.weeklyMessages.toLocaleString()} msgs`;
    case "weekly-voice": {
      const h = Math.floor(stats.weeklyVoiceMinutes / 60);
      const m = stats.weeklyVoiceMinutes % 60;
      return `${n}. ${stats.userId.padEnd(20)} ${h > 0 ? `${h}h ${m}m` : `${m}m`}`;
    }
  }
}

function buildRow(page: number, hasMore: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("lb_prev")
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("lb_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasMore),
  );
}

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server leaderboard")
    .addStringOption((opt) =>
      opt
        .setName("category")
        .setDescription("Leaderboard category (default: Levels)")
        .setRequired(false)
        .addChoices(
          { name: "Levels", value: "levels" },
          { name: "Messages", value: "messages" },
          { name: "Voice", value: "voice" },
          { name: "Weekly Messages", value: "weekly-messages" },
          { name: "Weekly Voice", value: "weekly-voice" },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = interaction.guildId!;
    const category = (interaction.options.getString("category") ?? "levels") as Category;
    let page = 0;

    async function render(p: number): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
      const users = await fetchPage(guildId, category, p);
      const startRank = p * PAGE_SIZE + 1;
      const hasMore = users.length === PAGE_SIZE && p + 1 < MAX_PAGES;

      if (users.length === 0) {
        return {
          content: `**${CATEGORY_LABELS[category]} Leaderboard** — Page ${p + 1}\n\nNo data yet.`,
          components: [],
        };
      }

      const rows = users.map((u, i) => formatRow(u, startRank + i, category));
      const header = `${CATEGORY_LABELS[category]} Leaderboard — Page ${p + 1}`;
      const content = `**${header}**\n\`\`\`\n${rows.join("\n")}\n\`\`\``;

      return { content, components: [buildRow(p, hasMore)] };
    }

    const initial = await render(page);
    const reply = await interaction.editReply(initial);

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.customId === "lb_prev" && page > 0) page--;
      else if (btn.customId === "lb_next") page++;
      const updated = await render(page);
      await btn.update(updated);
    });

    collector.on("end", async () => {
      try {
        const final = await render(page);
        for (const row of final.components) {
          for (const comp of row.components) {
            (comp as ButtonBuilder).setDisabled(true);
          }
        }
        await interaction.editReply(final);
      } catch {
        // Interaction may have expired
      }
    });
  },
};
