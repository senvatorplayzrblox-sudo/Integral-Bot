import type { Message } from "discord.js";
import { getGuildConfig } from "../../db/models/GuildConfig.js";
import { buildSetupPanelPayload, initSession } from "../../lib/welcome.js";

export async function welcomesetup(message: Message): Promise<void> {
  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const guildId = message.guildId!;
  const config = await getGuildConfig(guildId);
  const payload = buildSetupPanelPayload(config);

  const sent = await message.reply(payload);

  initSession(guildId, message.author.id, sent.id, sent.channelId, config);
}
