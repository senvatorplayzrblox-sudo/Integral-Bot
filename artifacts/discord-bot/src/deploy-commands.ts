import { REST, Routes } from "discord.js";
import { logger } from "./lib/logger.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

if (!config.token || !config.clientId) {
  logger.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required for deployment");
  process.exit(1);
}

const rest = new REST().setToken(config.token);
const body = [...commands.values()].map((c) => c.data.toJSON());

try {
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    logger.info({ guildId: config.guildId, count: body.length }, "Registered guild commands (instant)");
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    logger.info({ count: body.length }, "Registered global commands (up to 1h to propagate)");
  }
} catch (err) {
  logger.error({ err }, "Failed to deploy commands");
  process.exit(1);
}
