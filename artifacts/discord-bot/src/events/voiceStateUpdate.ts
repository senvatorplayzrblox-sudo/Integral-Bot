import type { VoiceState } from "discord.js";
import { logger } from "../lib/logger.js";
import { endVoiceSession, startVoiceSession } from "../db/models/GuildMember.js";

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
    // Joined a voice channel
    await startVoiceSession(guildId, userId, now);
    logger.debug({ userId, channel: newState.channel?.name }, "Voice session started");
    return;
  }

  if (wasInVoice && !isInVoice) {
    // Left voice entirely
    const minutes = await endVoiceSession(guildId, userId, now);
    logger.debug({ userId, minutes }, "Voice session ended");
    return;
  }

  // Switched channels (wasInVoice && isInVoice && different channel):
  // keep the original voiceJoinedAt — do not reset the timer
}
