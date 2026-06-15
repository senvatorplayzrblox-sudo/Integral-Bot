import type { ChatInputCommandInteraction } from "discord.js";

export interface Command {
  data: {
    name: string;
    toJSON(): unknown;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
