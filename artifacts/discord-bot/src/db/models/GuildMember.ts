import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface UserStats {
  guildId: string;
  userId: string;
  xp: number;
  level: number;
  messages: number;
  weeklyMessages: number;
  voiceMinutes: number;
  weeklyVoiceMinutes: number;
  lastMessageXP: Date;
  voiceJoinedAt: Date | null;
}

type UserStatsDocument = UserStats & Document;

const userStatsSchema = new Schema<UserStatsDocument>(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    weeklyMessages: { type: Number, default: 0 },
    voiceMinutes: { type: Number, default: 0 },
    weeklyVoiceMinutes: { type: Number, default: 0 },
    lastMessageXP: { type: Date, default: () => new Date(0) },
    voiceJoinedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });
userStatsSchema.index({ guildId: 1, xp: -1 });
userStatsSchema.index({ guildId: 1, messages: -1 });
userStatsSchema.index({ guildId: 1, voiceMinutes: -1 });
userStatsSchema.index({ guildId: 1, weeklyMessages: -1 });
userStatsSchema.index({ guildId: 1, weeklyVoiceMinutes: -1 });

  export const UserStatsModel: Model<UserStatsDocument> =
  mongoose.models["UserStats"] ??
  mongoose.model<UserStatsDocument>("UserStats", userStatsSchema);

function toPlain(doc: UserStatsDocument): UserStats {
  return {
    guildId: doc.guildId,
    userId: doc.userId,
    xp: doc.xp,
    level: doc.level,
    messages: doc.messages,
    weeklyMessages: doc.weeklyMessages,
    voiceMinutes: doc.voiceMinutes,
    weeklyVoiceMinutes: doc.weeklyVoiceMinutes,
    lastMessageXP: doc.lastMessageXP,
    voiceJoinedAt: doc.voiceJoinedAt,
  };
}

export async function getOrCreate(guildId: string, userId: string): Promise<UserStats> {
  const doc = await UserStatsModel.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true, returnDocument: "after" },
  );
  return toPlain(doc);
}

export async function save(stats: UserStats): Promise<void> {
  await UserStatsModel.updateOne(
    { guildId: stats.guildId, userId: stats.userId },
    {
      $set: {
        xp: stats.xp,
        level: stats.level,
        messages: stats.messages,
        weeklyMessages: stats.weeklyMessages,
        voiceMinutes: stats.voiceMinutes,
        weeklyVoiceMinutes: stats.weeklyVoiceMinutes,
        lastMessageXP: stats.lastMessageXP,
      },
    },
    { upsert: true },
  );
}

// ── Voice session helpers ────────────────────────────────────────────────────

export async function startVoiceSession(
  guildId: string,
  userId: string,
  joinedAt: Date,
): Promise<void> {
  await UserStatsModel.updateOne(
    { guildId, userId },
    { $set: { voiceJoinedAt: joinedAt }, $setOnInsert: { guildId, userId } },
    { upsert: true },
  );
}

export async function endVoiceSession(
  guildId: string,
  userId: string,
  now: Date,
): Promise<number> {
  const doc = await UserStatsModel.findOne({ guildId, userId }).select("voiceJoinedAt");
  if (!doc?.voiceJoinedAt) return 0;

  const durationMs = now.getTime() - doc.voiceJoinedAt.getTime();

const minutes = Math.floor(durationMs / 60_000);

// 15 sec = 1 message worth XP
const chunks = Math.floor(durationMs / 15_000);

let xpGain = 0;

for (let i = 0; i < chunks; i++) {
  xpGain += Math.floor(Math.random() * (10 - 5 + 1)) + 5;
}

await UserStatsModel.updateOne(
  { guildId, userId },
  minutes > 0 || xpGain > 0
    ? {
        $inc: {
          voiceMinutes: minutes,
          weeklyVoiceMinutes: minutes,
          xp: xpGain,
        },
        $unset: { voiceJoinedAt: 1 },
      }
    : {
        $unset: { voiceJoinedAt: 1 },
      },
);
  return minutes;
}

export async function clearAllVoiceSessions(guildId: string): Promise<void> {
  await UserStatsModel.updateMany({ guildId }, { $unset: { voiceJoinedAt: 1 } });
}

export async function bulkStartVoiceSessions(
  guildId: string,
  userIds: string[],
  joinedAt: Date,
): Promise<void> {
  if (userIds.length === 0) return;
  await UserStatsModel.bulkWrite(
    userIds.map((userId) => ({
      updateOne: {
        filter: { guildId, userId },
        update: { $set: { voiceJoinedAt: joinedAt }, $setOnInsert: { guildId, userId } },
        upsert: true,
      },
    })),
  );
}

// ── Leaderboard / rank queries ───────────────────────────────────────────────

export async function countGuildMembers(guildId: string): Promise<number> {
  return UserStatsModel.countDocuments({ guildId });
}

export async function getTopByXp(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return UserStatsModel.find({ guildId }).sort({ xp: -1 }).skip(offset).limit(limit).lean<UserStats[]>();
}

export async function getTopByMessages(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return UserStatsModel.find({ guildId }).sort({ messages: -1 }).skip(offset).limit(limit).lean<UserStats[]>();
}

export async function getTopByVoice(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return UserStatsModel.find({ guildId }).sort({ voiceMinutes: -1 }).skip(offset).limit(limit).lean<UserStats[]>();
}

export async function getTopByWeeklyMessages(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return UserStatsModel.find({ guildId }).sort({ weeklyMessages: -1 }).skip(offset).limit(limit).lean<UserStats[]>();
}

export async function getTopByWeeklyVoice(
  guildId: string,
  limit: number,
  offset: number,
): Promise<UserStats[]> {
  return UserStatsModel.find({ guildId }).sort({ weeklyVoiceMinutes: -1 }).skip(offset).limit(limit).lean<UserStats[]>();
}

export async function getRankByXp(guildId: string, userId: string): Promise<number> {
  const stats = await UserStatsModel.findOne({ guildId, userId }).lean<UserStats>();
  if (!stats) return -1;
  const above = await UserStatsModel.countDocuments({ guildId, xp: { $gt: stats.xp } });
  return above + 1;
}

export async function getRankByWeeklyMessages(guildId: string, userId: string): Promise<number> {
  const stats = await UserStatsModel.findOne({ guildId, userId }).lean<UserStats>();
  if (!stats) return -1;
  const above = await UserStatsModel.countDocuments({ guildId, weeklyMessages: { $gt: stats.weeklyMessages } });
  return above + 1;
}

export async function getRankByWeeklyVoice(guildId: string, userId: string): Promise<number> {
  const stats = await UserStatsModel.findOne({ guildId, userId }).lean<UserStats>();
  if (!stats) return -1;
  const above = await UserStatsModel.countDocuments({ guildId, weeklyVoiceMinutes: { $gt: stats.weeklyVoiceMinutes } });
  return above + 1;
}

export async function bulkEnsureMembers(guildId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await UserStatsModel.bulkWrite(
    userIds.map((userId) => ({
      updateOne: {
        filter: { guildId, userId },
        update: { $setOnInsert: { guildId, userId } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}
