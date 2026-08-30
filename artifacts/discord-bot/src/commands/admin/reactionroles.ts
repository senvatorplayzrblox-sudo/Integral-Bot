import type { Message } from "discord.js";
import { errorReply } from "../../lib/reply.js";
import { buildReactionRoleSetupPayload, startReactionRoleSession } from "../../lib/reactionRoles.js";

export async function reactionroles(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await errorReply(message, "Missing Permissions", "You need **Administrator** permission to configure reaction roles.");
    return;
  }

  const sent = await message.reply(await buildReactionRoleSetupPayload(message.guildId!));
  await startReactionRoleSession(message.guildId!, message.author.id, sent.id, sent.channelId);
}