import type { GuildMember } from "discord.js";
import { getGuildConfig } from "../db/models/GuildConfig.js";
import { bulkEnsureMembers } from "../db/models/GuildMember.js";
import { logger } from "../lib/logger.js";
import { resolveVars, buildWelcomeEmbed } from "../lib/welcome.js";

export default async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  // Seed the new member into the stats DB so rank totals stay accurate
  await bulkEnsureMembers(member.guild.id, [member.id]).catch((err) =>
    logger.error({ err }, "Failed to seed new guild member"),
  );

  // Send welcome message if configured
  const config = await getGuildConfig(member.guild.id);

  if (!config.welcomeEnabled || !config.welcomeChannelId) return;

  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel?.isTextBased()) return;

  try {
    const aboveText = config.welcomeAboveText
      ? resolveVars(config.welcomeAboveText, member)
      : null;

    const embed = buildWelcomeEmbed(
      {
        title:       config.welcomeTitle,
        description: config.welcomeDescription,
        footer:      config.welcomeFooter,
        bannerUrl:   config.welcomeBanner,
        color:       config.welcomeColor,
      },
      member,
    );

    await channel.send({
      ...(aboveText ? { content: aboveText } : {}),
      embeds: [embed],
    });
  } catch (err) {
    logger.error(
      { err, guildId: member.guild.id, userId: member.id },
      "Failed to send welcome message",
    );
  }
}
