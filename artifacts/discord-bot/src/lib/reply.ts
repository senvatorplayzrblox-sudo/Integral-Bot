import { EmbedBuilder, type Message } from "discord.js";

// ── Color palette ─────────────────────────────────────────────────────────

const COLORS = {
  success: 0x57f287, // green
  error:   0xe74c3c, // red
  info:    0x5865f2, // blurple
  warning: 0xfee75c, // yellow
} as const;

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

// ── Public helpers ────────────────────────────────────────────────────────

/** ✅ Green embed — action completed successfully. */
export async function successReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await message.reply({
    embeds: [buildEmbed(COLORS.success, `✅  ${title}`, description)],
  });
}

/** ❌ Red embed — something went wrong or input is invalid. */
export async function errorReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await message.reply({
    embeds: [buildEmbed(COLORS.error, `❌  ${title}`, description)],
  });
}

/** ℹ️ Blurple embed — neutral information display. */
export async function infoReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await message.reply({
    embeds: [buildEmbed(COLORS.info, `ℹ️  ${title}`, description)],
  });
}

/** ⚠️ Yellow embed — non-fatal warnings or confirmations. */
export async function warningReply(
  message: Message,
  title: string,
  description?: string,
): Promise<void> {
  await message.reply({
    embeds: [buildEmbed(COLORS.warning, `⚠️  ${title}`, description)],
  });
}

/** Build a raw embed without sending — for use in interaction responses. */
export function makeEmbed(
  type: "success" | "error" | "info" | "warning",
  title: string,
  description?: string,
): EmbedBuilder {
  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" } as const;
  return buildEmbed(COLORS[type], `${icons[type]}  ${title}`, description);
}
