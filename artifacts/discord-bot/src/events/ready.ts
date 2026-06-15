import type { Client } from "discord.js";
import { logger } from "../lib/logger.js";

export default function onReady(client: Client): void {
  logger.info(`Integral is online as ${client.user?.tag ?? "unknown"}`);
  logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
}
