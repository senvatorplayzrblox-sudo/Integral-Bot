import type { Client } from "discord.js";
import { logger } from "../lib/logger.js";
import {
  bulkEnsureMembers,
  bulkStartVoiceSessions,
  clearAllVoiceSessions,
} from "../db/models/GuildMember.js";
import { startXpEventScheduler } from "../lib/xpEvent.js";

export default async function onReady(client: Client): Promise<void> {
  await startXpEventScheduler(client);
  logger.info(`Integral is online as ${client.user?.tag ?? "unknown"}`);
  logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
  client.user?.setPresence({
  status: "online",
});
  logger.info(`Bot presence: ${client.user?.presence?.status}`);

  for (const guild of client.guilds.cache.values()) {
    const now = new Date();

    // Fetch every guild member so the cache is fully populated and all
    // members have a DB record (required for accurate rank totals).
    let allMembers;
    try {
      allMembers = await guild.members.fetch();
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "Failed to fetch guild members");
      continue;
    }

    const humanIds = [...allMembers.values()]
      .filter((m) => !m.user.bot)
      .map((m) => m.id);

    await bulkEnsureMembers(guild.id, humanIds);
    logger.info({ guildId: guild.id, count: humanIds.length }, "Seeded guild members in DB");

    // Resume voice tracking: clear stale timestamps, then re-mark anyone
    // currently in a voice channel with the current time.
    await clearAllVoiceSessions(guild.id);

    const activeVoiceIds: string[] = [];
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased()) continue;
      for (const member of channel.members.values()) {
        if (!member.user.bot) activeVoiceIds.push(member.id);
      }
    }

    if (activeVoiceIds.length > 0) {
      await bulkStartVoiceSessions(guild.id, activeVoiceIds, now);
      logger.info(
        { guildId: guild.id, count: activeVoiceIds.length },
        "Resumed voice tracking for active members",
      );
    }
  }
}
