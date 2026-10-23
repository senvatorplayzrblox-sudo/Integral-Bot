import { Collection } from "discord.js";
import type { Command } from "../types.js";
import { rank } from "./rank.js";
import { leaderboard } from "./leaderboard.js";
import { setup } from "./setup.js";
import { xpevent } from "./xpevent.js";

export const commands = new Collection<string, Command>([
  [rank.data.name, rank],
  [leaderboard.data.name, leaderboard],
  [setup.data.name, setup],
  [xpevent.data.name, xpevent],
]);