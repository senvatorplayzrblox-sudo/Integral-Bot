export const config = {
  token: process.env["DISCORD_TOKEN"] ?? "",
  clientId: process.env["DISCORD_CLIENT_ID"] ?? "",
  guildId: process.env["DISCORD_GUILD_ID"] ?? "",
  levelChannel: process.env["LEVEL_UP_CHANNEL_ID"] ?? null,
  xp: {
    minPerMessage: 15,
    maxPerMessage: 25,
    cooldownSeconds: 60,
  },
} as const;

export function xpForNextLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function levelFromXp(xp: number): number {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  return level;
}

export function xpInCurrentLevel(xp: number): number {
  let remaining = xp;
  let level = 0;
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  return remaining;
}
