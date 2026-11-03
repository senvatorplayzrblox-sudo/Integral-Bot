import type { VoiceState } from "discord.js";
import { logger } from "../lib/logger.js";
import {
  endVoiceSession,
  startVoiceSession,
} from "../db/models/GuildMember.js";
import { getGuildConfig } from "../utils/getGuildConfig.js";
import { applyLevelRoles } from "../lib/levelRoles.js";
import { sendLevelUpNotification } from "../lib/levelUp.js";
import { getActiveXpMultiplier } from "../lib/xpEvent.js";

export default async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const guildId = newState.guild.id;
  const userId = member.id;
  const now = new Date();

  const wasInVoice = oldState.channelId !== null;
  const isInVoice = newState.channelId !== null;

  if (!wasInVoice && isInVoice) {
    await startVoiceSession(guildId, userId, now);

    logger.debug(
      { userId, channel: newState.channel?.name },
      "Voice session started",
    );

    return;
  }

  if (wasInVoice && !isInVoice) {
    const multiplier = await getActiveXpMultiplier(
      newState.client,
      guildId,
    );

    const result = await endVoiceSession(
      guildId,
      userId,
      now,
      multiplier ?? 1,
    );

    logger.debug(
      {
        userId,
        minutes: result.minutes,
        xpGained: result.xpGained,
      },
      "Voice session ended",
    );

    if (result.newLevel > result.oldLevel) {
      const guildConfig = await getGuildConfig(guildId);

      await applyLevelRoles(
        newState.guild,
        member,
        result.oldLevel,
        result.newLevel,
        guildConfig,
      );

      await sendLevelUpNotification(
        newState.guild,
        userId,
        result.oldLevel,
        result.newLevel,
        guildConfig,
      );
    }

    return;
  }

  // Switched channels (wasInVoice && isInVoice):
  // keep original voiceJoinedAt — no timer reset
}
