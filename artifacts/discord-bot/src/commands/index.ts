import { Collection } from "discord.js";
import type { Command } from "../types.js";
import { rank } from "./rank.js";
import { leaderboard } from "./leaderboard.js";

export const commands = new Collection<string, Command>([
  [rank.data.name, rank],
  [leaderboard.data.name, leaderboard],
]);
