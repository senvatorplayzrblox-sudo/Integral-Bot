// TODO: Replace this in-memory store with a Mongoose model backed by MongoDB.
// The interface and all exported function signatures must stay identical so
// the rest of the codebase requires zero changes when you swap the backing store.

export interface UserStats {
  guildId: string;
  userId: string;
  xp: number;
  level: number;
  messages: number;
  voiceMinutes: number;
  weeklyMessages: number;
  weeklyVoiceMinutes: number;
  lastMessageTimestamp: number;
}

const store = new Map<string, UserStats>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function makeDefault(guildId: string, userId: string): UserStats {
  return {
    guildId,
    userId,
    xp: 0,
    level: 0,
    messages: 0,
    voiceMinutes: 0,
    weeklyMessages: 0,
    weeklyVoiceMinutes: 0,
    lastMessageTimestamp: 0,
  };
}

export async function getOrCreate(guildId: string, userId: string): Promise<UserStats> {
  const k = key(guildId, userId);
  if (!store.has(k)) store.set(k, makeDefault(guildId, userId));
  return { ...store.get(k)! };
}

export async function save(stats: UserStats): Promise<void> {
  store.set(key(stats.guildId, stats.userId), { ...stats });
}

export async function countGuildMembers(guildId: string): Promise<number> {
  return [...store.values()].filter((s) => s.guildId === guildId).length;
}

export async function getTopByXp(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.xp - a.xp)
    .slice(offset, offset + limit);
}

export async function getTopByMessages(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.messages - a.messages)
    .slice(offset, offset + limit);
}

export async function getTopByVoice(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.voiceMinutes - a.voiceMinutes)
    .slice(offset, offset + limit);
}

export async function getTopByWeeklyMessages(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.weeklyMessages - a.weeklyMessages)
    .slice(offset, offset + limit);
}

export async function getTopByWeeklyVoice(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.weeklyVoiceMinutes - a.weeklyVoiceMinutes)
    .slice(offset, offset + limit);
}

export async function getRankByXp(guildId: string, userId: string): Promise<number> {
  const sorted = [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.xp - a.xp);
  const idx = sorted.findIndex((s) => s.userId === userId);
  return idx === -1 ? sorted.length + 1 : idx + 1;
}

export async function getRankByWeeklyMessages(guildId: string, userId: string): Promise<number> {
  const sorted = [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.weeklyMessages - a.weeklyMessages);
  const idx = sorted.findIndex((s) => s.userId === userId);
  return idx === -1 ? sorted.length + 1 : idx + 1;
}

export async function getRankByWeeklyVoice(guildId: string, userId: string): Promise<number> {
  const sorted = [...store.values()]
    .filter((s) => s.guildId === guildId)
    .sort((a, b) => b.weeklyVoiceMinutes - a.weeklyVoiceMinutes);
  const idx = sorted.findIndex((s) => s.userId === userId);
  return idx === -1 ? sorted.length + 1 : idx + 1;
}
