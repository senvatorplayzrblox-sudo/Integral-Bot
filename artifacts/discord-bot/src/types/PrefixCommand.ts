import type { Message } from "discord.js";

export interface PrefixCommand {
  name: string;
  execute(message: Message, args: string[]): Promise<void>;
}