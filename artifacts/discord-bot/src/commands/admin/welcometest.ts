import type { Message } from "discord.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { resolveVars, buildWelcomeEmbed } from "../../lib/welcome.js";

export async function welcometest(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const guildId = message.guildId!;
  const config = await getGuildConfig(guildId);

  if (!config.welcomeTitle && !config.welcomeDescription) {
    await message.reply(
      "❌ No welcome message configured yet. Run `&welcomesetup` to set one up.",
    );
    return;
  }

  // Use the mentioned member, or fall back to the command executor
  const mentionedUser = message.mentions.members?.first() ?? null;
  const targetMember = mentionedUser ?? message.member;

  const aboveText = config.welcomeAboveText
    ? resolveVars(config.welcomeAboveText, targetMember)
    : null;

  const embed = buildWelcomeEmbed(
    {
      title:       config.welcomeTitle,
      description: config.welcomeDescription,
      footer:      config.welcomeFooter,
      bannerUrl:   config.welcomeBanner,
      color:       config.welcomeColor,
    },
    targetMember,
  );

  if (!message.inGuild()) return;

  await message.channel.send({
    ...(aboveText ? { content: aboveText } : {}),
    embeds: [embed],
  });
}
