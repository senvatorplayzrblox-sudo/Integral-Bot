import { Events } from "discord.js";
import { client } from "./client.js";
import { commands } from "./commands/index.js";
import { connectDatabase } from "./db/connection.js";
import { logger } from "./lib/logger.js";
import { config } from "./config.js";
import { startWeeklyResetScheduler } from "./lib/weeklyReset.js";
import onReady from "./events/ready.js";
import onMessageCreate from "./events/messageCreate.js";
import onInteractionCreate from "./events/interactionCreate.js";
import onVoiceStateUpdate from "./events/voiceStateUpdate.js";
import onGuildMemberAdd from "./events/guildMemberAdd.js";

if (!config.token) {
  logger.error("DISCORD_TOKEN environment variable is required");
  process.exit(1);
}

for (const [name, command] of commands) {
  client.commands.set(name, command);
}

client.once(Events.ClientReady, () => void onReady(client));
client.on(Events.MessageCreate, (msg) => void onMessageCreate(msg));
client.on(Events.InteractionCreate, (interaction) => void onInteractionCreate(client, interaction));
client.on(Events.VoiceStateUpdate, (oldState, newState) => void onVoiceStateUpdate(oldState, newState));
client.on(Events.GuildMemberAdd, (member) => void onGuildMemberAdd(member));
client.on(Events.Error, (err) => logger.error({ err }, "Discord client error"));
client.on(Events.Warn, (msg) => logger.warn({ msg }, "Discord client warning"));

await connectDatabase();
await startWeeklyResetScheduler();

logger.info("Logging in to Discord...");
await client.login(config.token);
