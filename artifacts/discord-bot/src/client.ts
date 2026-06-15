import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { Command } from "./types.js";

export class IntegralClient extends Client {
  commands = new Collection<string, Command>();
}

export const client = new IntegralClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});
