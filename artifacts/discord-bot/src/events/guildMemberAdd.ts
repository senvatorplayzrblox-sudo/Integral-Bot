import type { GuildMember } from "discord.js";
import { getGuildConfig } from "../db/models/GuildConfig.js";
import { bulkEnsureMembers } from "../db/models/GuildMember.js";
import { logger } from "../lib/logger.js";
import { sendWelcomeMessage } from "../lib/welcome.js";

export default async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  // Seed the new member into the stats DB so rank totals stay accurate.
  await bulkEnsureMembers(member.guild.id, [member.id]).catch((err) =>
    logger.error({ err }, "Failed to seed new guild member"),
  );

  const config = await getGuildConfig(member.guild.id);
  if (!config.welcomeEnabled || !config.welcomeChannelId) return;

  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel?.isTextBased()) return;

  try {
    await sendWelcomeMessage(config, member, channel);
  } catch (err) {
    logger.error(
      { err, guildId: member.guild.id, userId: member.id },
      "Failed to send welcome message",
    );
  }
}
