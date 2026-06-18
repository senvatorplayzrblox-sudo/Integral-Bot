import { getGuildConfig as getConfig } from "../db/models/GuildConfig.js";

export async function getGuildConfig(guildId: string) {
  return await getConfig(guildId);
}