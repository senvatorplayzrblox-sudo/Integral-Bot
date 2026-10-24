import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { levelFromXp, xpForNextLevel } from "../config.js";

let activeMultiplier = 1;
let currentStats: Record<string, unknown> = {};
let savedStats: Record<string, unknown> | undefined;
let voiceAward: unknown[] | undefined;

const getOrCreate = mock.fn(async () => currentStats);
const save = mock.fn(async (stats: Record<string, unknown>) => {
  savedStats = structuredClone(stats);
});
const getActiveXpMultiplier = mock.fn(async () => activeMultiplier);
const calculateBoostedXp = mock.fn((baseXp: number, multiplier: number) =>
  Math.floor(baseXp * multiplier),
);
const startVoiceSession = mock.fn(async () => {});
const endVoiceSession = mock.fn(async (...args: unknown[]) => {
  voiceAward = args;
  const multiplier = Number(args[3] ?? 1);
  const xpGained = Math.floor(32 * multiplier);
  const oldLevel = Number(currentStats["level"] ?? 0);
  const newXp = Number(currentStats["xp"] ?? 0) + xpGained;
  const newLevel = levelFromXp(newXp);

  currentStats["xp"] = newXp;
  currentStats["level"] = newLevel;
  savedStats = structuredClone(currentStats);

  return { minutes: 1, xpGained, oldLevel, newLevel };
});
const guildConfig = {
  levelChannelId: "level-channel",
  levelRoles: { "1": "role-1" },
};
const getGuildConfig = mock.fn(async () => guildConfig);
const applyLevelRoles = mock.fn(async (..._args: unknown[]) => {});
const sendLevelUpNotification = mock.fn(async (..._args: unknown[]) => {});

mock.module(new URL("../prefix/handler.js", import.meta.url).href, {
  exports: { default: async () => false },
} as never);
mock.module(new URL("../db/models/GuildMember.js", import.meta.url).href, {
  exports: { getOrCreate, save, startVoiceSession, endVoiceSession },
} as never);
mock.module(new URL("../lib/xpEvent.js", import.meta.url).href, {
  exports: { getActiveXpMultiplier, calculateBoostedXp },
} as never);
mock.module(new URL("../utils/getGuildConfig.js", import.meta.url).href, {
  exports: { getGuildConfig },
} as never);
mock.module(new URL("../lib/levelRoles.js", import.meta.url).href, {
  exports: { applyLevelRoles },
} as never);
mock.module(new URL("../lib/levelUp.js", import.meta.url).href, {
  exports: { sendLevelUpNotification },
} as never);
mock.module(new URL("../lib/reply.js", import.meta.url).href, {
  exports: {
    errorReply: async () => {},
    successReply: async () => {},
  },
} as never);

const { default: onMessageCreate } = await import("./messageCreate.js");
const { default: onVoiceStateUpdate } = await import("./voiceStateUpdate.js");
const { givexp } = await import("../commands/admin/givexp.js");
const random = mock.method(Math, "random", () => 0.5);

function freshStats(): Record<string, unknown> {
  return {
    guildId: "guild-1",
    userId: "user-1",
    xp: 0,
    level: 0,
    messages: 0,
    weeklyMessages: 0,
    voiceMinutes: 0,
    weeklyVoiceMinutes: 0,
    lastMessageXP: new Date(0),
    voiceJoinedAt: null,
  };
}

function resetLevelEffectMocks(): void {
  getGuildConfig.mock.resetCalls();
  applyLevelRoles.mock.resetCalls();
  sendLevelUpNotification.mock.resetCalls();
}

async function deliverMessage(
  multiplier: number,
  startingXp = 0,
): Promise<{
  stats: Record<string, unknown>;
  guild: Record<string, unknown>;
  member: Record<string, unknown>;
}> {
  activeMultiplier = multiplier;
  currentStats = freshStats();
  currentStats["xp"] = startingXp;
  currentStats["level"] = levelFromXp(startingXp);
  savedStats = undefined;
  resetLevelEffectMocks();

  const member = { id: "user-1", user: { bot: false } };
  const guild = {
    id: "guild-1",
    members: { fetch: mock.fn(async () => member) },
  };
  await onMessageCreate({
    author: { id: "user-1", bot: false },
    inGuild: () => true,
    guildId: "guild-1",
    guild,
    channelId: "channel-1",
    client: {},
  } as never);

  assert.ok(savedStats);
  return { stats: savedStats, guild, member };
}

async function awardMessage(multiplier: number): Promise<Record<string, unknown>> {
  return (await deliverMessage(multiplier)).stats;
}

test("message XP applies an active event multiplier once after base XP is rolled", async (t) => {
  await t.test("active event", async () => {
    getActiveXpMultiplier.mock.resetCalls();
    calculateBoostedXp.mock.resetCalls();

    const stats = await awardMessage(3);

    assert.equal(stats.xp, 24, "8 normal XP is multiplied once, not zero or twice");
    assert.equal(getActiveXpMultiplier.mock.callCount(), 1);
    assert.equal(calculateBoostedXp.mock.callCount(), 1);
    assert.deepEqual(calculateBoostedXp.mock.calls[0]?.arguments, [8, 3]);
  });

  await t.test("no active event", async () => {
    getActiveXpMultiplier.mock.resetCalls();
    calculateBoostedXp.mock.resetCalls();

    const stats = await awardMessage(1);

    assert.equal(stats.xp, 8);
    assert.equal(getActiveXpMultiplier.mock.callCount(), 1);
    assert.equal(calculateBoostedXp.mock.callCount(), 1);
    assert.deepEqual(calculateBoostedXp.mock.calls[0]?.arguments, [8, 1]);
  });

  await t.test("event has expired", async () => {
    getActiveXpMultiplier.mock.resetCalls();
    calculateBoostedXp.mock.resetCalls();

    const stats = await awardMessage(1);

    assert.equal(stats.xp, 8);
    assert.equal(getActiveXpMultiplier.mock.callCount(), 1);
    assert.equal(calculateBoostedXp.mock.callCount(), 1);
    assert.deepEqual(calculateBoostedXp.mock.calls[0]?.arguments, [8, 1]);
  });
});

async function deliverVoiceSession(
  multiplier: number,
  startingXp = 0,
): Promise<{
  award: unknown[] | undefined;
  stats: Record<string, unknown>;
  guild: Record<string, unknown>;
  member: Record<string, unknown>;
}> {
  activeMultiplier = multiplier;
  currentStats = freshStats();
  currentStats["xp"] = startingXp;
  currentStats["level"] = levelFromXp(startingXp);
  savedStats = undefined;
  voiceAward = undefined;
  endVoiceSession.mock.resetCalls();
  getActiveXpMultiplier.mock.resetCalls();
  resetLevelEffectMocks();

  const member = { id: "user-1", user: { bot: false } };
  const guild = { id: "guild-1" };
  await onVoiceStateUpdate(
    {
      channelId: "voice-1",
      member,
    } as never,
    {
      channelId: null,
      member,
      guild,
      client: {},
    } as never,
  );

  assert.equal(getActiveXpMultiplier.mock.callCount(), 1);
  assert.equal(endVoiceSession.mock.callCount(), 1);
  assert.ok(savedStats);
  return { award: voiceAward, stats: savedStats, guild, member };
}

async function awardVoiceSession(multiplier: number): Promise<unknown[] | undefined> {
  return (await deliverVoiceSession(multiplier)).award;
}

test("voice-session XP uses the active multiplier once and stays normal without an event", async (t) => {
  await t.test("active event", async () => {
    const actualVoiceAward = await awardVoiceSession(3);
    assert.deepEqual(actualVoiceAward?.slice(0, 2), ["guild-1", "user-1"]);
    assert.ok(actualVoiceAward?.[2] instanceof Date);
    assert.equal(actualVoiceAward?.[3], 3);
  });

  await t.test("no active event", async () => {
    const actualVoiceAward = await awardVoiceSession(1);
    assert.equal(actualVoiceAward?.[3], 1);
  });

  await t.test("event has expired", async () => {
    const actualVoiceAward = await awardVoiceSession(1);
    assert.equal(actualVoiceAward?.[3], 1);
  });
});

test("boosted message XP triggers level-up effects once only when it crosses a level", async (t) => {
  await t.test("boosted award crosses a level", async () => {
    const startingXp = xpForNextLevel(0) - 20;
    const { stats, guild, member } = await deliverMessage(3, startingXp);

    assert.equal(stats["xp"], xpForNextLevel(0) + 4);
    assert.equal(stats["level"], 1);
    assert.equal(getGuildConfig.mock.callCount(), 1);
    assert.equal(applyLevelRoles.mock.callCount(), 1);
    assert.deepEqual(applyLevelRoles.mock.calls[0]?.arguments, [
      guild,
      member,
      0,
      1,
      guildConfig,
    ]);
    assert.equal(sendLevelUpNotification.mock.callCount(), 1);
    assert.deepEqual(sendLevelUpNotification.mock.calls[0]?.arguments, [
      guild,
      "user-1",
      0,
      1,
      guildConfig,
      "channel-1",
    ]);
  });

  await t.test("award does not cross a level", async () => {
    const { stats } = await deliverMessage(1);

    assert.equal(stats["level"], 0);
    assert.equal(getGuildConfig.mock.callCount(), 0);
    assert.equal(applyLevelRoles.mock.callCount(), 0);
    assert.equal(sendLevelUpNotification.mock.callCount(), 0);
  });
});

test("boosted voice-session XP triggers level-up effects once only when it crosses a level", async (t) => {
  await t.test("boosted award crosses a level and saves the new level", async () => {
    const startingXp = xpForNextLevel(0) - 80;
    const { award, stats, guild, member } = await deliverVoiceSession(3, startingXp);

    assert.equal(award?.[3], 3);
    assert.equal(stats["xp"], xpForNextLevel(0) + 16);
    assert.equal(stats["level"], 1);
    assert.equal(getGuildConfig.mock.callCount(), 1);
    assert.equal(applyLevelRoles.mock.callCount(), 1);
    assert.deepEqual(applyLevelRoles.mock.calls[0]?.arguments, [
      guild,
      member,
      0,
      1,
      guildConfig,
    ]);
    assert.equal(sendLevelUpNotification.mock.callCount(), 1);
    assert.deepEqual(sendLevelUpNotification.mock.calls[0]?.arguments, [
      guild,
      "user-1",
      0,
      1,
      guildConfig,
    ]);
  });

  await t.test("award does not cross a level", async () => {
    const { stats } = await deliverVoiceSession(1);

    assert.equal(stats["level"], 0);
    assert.equal(getGuildConfig.mock.callCount(), 0);
    assert.equal(applyLevelRoles.mock.callCount(), 0);
    assert.equal(sendLevelUpNotification.mock.callCount(), 0);
  });
});

test("manual admin XP grant is not multiplied by an active event", async () => {
  currentStats = freshStats();
  savedStats = undefined;
  activeMultiplier = 3;
  getActiveXpMultiplier.mock.resetCalls();

  await givexp(
    {
      member: { permissions: { has: () => true } },
      mentions: { users: { first: () => ({ id: "user-2", toString: () => "<@user-2>" }) } },
      guildId: "guild-1",
    } as never,
    ["@user-2", "17"],
  );

  assert.equal((savedStats as Record<string, unknown> | undefined)?.["xp"], 17);
  assert.equal(getActiveXpMultiplier.mock.callCount(), 0);
});

test.after(() => {
  random.mock.restore();
});
