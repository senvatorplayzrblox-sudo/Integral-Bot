import { EmbedBuilder, type Message } from "discord.js";

// ── Color palette ─────────────────────────────────────────────────────────

const COLORS = {
  success: 0x57f287, // green
  error:   0xe74c3c, // red
  info:    0x5865f2, // blurple
  warning: 0xfee75c, // yellow
} as const;

// ── Auto-delete delay for temporary prefix replies ─────────────────────────

const AUTO_DELETE_MS = 12_000;

// ── Core builder ──────────────────────────────────────────────────────────

function buildEmbed(
  color: number,
  title: string,
  description?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

async function sendTemporary(message: Message, embed: EmbedBuilder): Promise<void> {
  const sent = await message.reply({ embeds: [embed] });
  setTimeout(() => sent.delete().catch(() => {}), AUTO_DELETE_MS);
}

// ── Public prefix helpers ─────────────────────────────────────────────────

/**
 * ✅ Green — action completed. Auto-deletes after 12 s.
 */
export async function successReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await sendTemporary(message, buildEmbed(COLORS.success, `✅  ${title}`, description));
}

/**
 * ❌ Red — error or invalid input. Auto-deletes after 12 s.
 */
export async function errorReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await sendTemporary(message, buildEmbed(COLORS.error, `❌  ${title}`, description));
}

/**
 * ℹ️ Blurple — important, persistent output (help, lists). Does NOT auto-delete.
 */
export async function infoReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await message.reply({ embeds: [buildEmbed(COLORS.info, `ℹ️  ${title}`, description)] });
}

/**
 * ⚠️ Yellow — non-fatal warning. Auto-deletes after 12 s.
 */
export async function warningReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await sendTemporary(message, buildEmbed(COLORS.warning, `⚠️  ${title}`, description));
}

/**
 * Build a raw EmbedBuilder without sending — for use in interaction responses
 * (interaction.reply, interaction.editReply, interaction.followUp, etc.)
 */
export function makeEmbed(
  type: "success" | "error" | "info" | "warning",
  title: string,
  description?: string,
): EmbedBuilder {
  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" } as const;
  return buildEmbed(COLORS[type], `${icons[type]}  ${title}`, description);
}
