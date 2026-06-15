import type { Client } from "discord.js";
import { logger } from "../lib/logger.js";
import { bulkStartVoiceSessions, clearAllVoiceSessions } from "../db/models/GuildMember.js";

export default async function onReady(client: Client): Promise<void> {
  logger.info(`Integral is online as ${client.user?.tag ?? "unknown"}`);
  logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

  // Resume voice tracking for anyone already in a voice channel at startup.
  // Clear stale voiceJoinedAt first (avoids double-counting time from before the restart),
  // then mark everyone currently in voice with the current time.
  for (const guild of client.guilds.cache.values()) {
    const now = new Date();

    await clearAllVoiceSessions(guild.id);

    const activeUserIds: string[] = [];
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased()) continue;
      for (const member of channel.members.values()) {
        if (!member.user.bot) activeUserIds.push(member.id);
      }
    }

    if (activeUserIds.length > 0) {
      await bulkStartVoiceSessions(guild.id, activeUserIds, now);
      logger.info(
        { guildId: guild.id, count: activeUserIds.length },
        "Resumed voice tracking for active members",
      );
    }
  }
}
