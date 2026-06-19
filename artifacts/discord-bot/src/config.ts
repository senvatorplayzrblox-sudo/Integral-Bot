export const config = {
  token: process.env["DISCORD_TOKEN"] ?? "",
  clientId: process.env["DISCORD_CLIENT_ID"] ?? "",
  guildId: process.env["DISCORD_GUILD_ID"] ?? "",
  levelChannel: process.env["LEVEL_UP_CHANNEL_ID"] ?? null,

  xp: {
    minPerMessage: 5,
    maxPerMessage: 10,
    cooldownSeconds: 30,
  },
} as const;


// XP required for each level
export function xpForNextLevel(level: number): number {
  return (5 * level * level + 50 * level + 100) * 2;
}


// Calculate current level from total XP
export function levelFromXp(xp: number): number {
  let level = 0;

  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level++;
  }

  return level;
}


// XP progress inside current level
export function xpInCurrentLevel(xp: number): number {
  let level = 0;

  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level++;
  }

  return xp;
}
