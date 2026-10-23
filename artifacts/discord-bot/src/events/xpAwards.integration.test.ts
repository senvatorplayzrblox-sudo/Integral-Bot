import assert from "node:assert/strict";
import { mock, test } from "node:test";

let activeMultiplier = 1;
let currentStats: Record<string, unknown>;
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
  return { minutes: 1, xpGained: 96, oldLevel: 0, newLevel: 0 };
});

mock.module(new URL("../prefix/handler.js", import.meta.url).href, {
  exports: { default: async () => false },
} as never);
mock.module(new URL("../db/models/GuildMember.js", import.meta.url).href, {
  exports: { getOrCreate, save, startVoiceSession, endVoiceSession },
} as never);
mock.module(new URL("../lib/xpEvent.js", import.meta.url).href, {
  exports: { getActiveXpMultiplier, calculateBoostedXp },
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

async function awardMessage(multiplier: number): Promise<Record<string, unknown>> {
  activeMultiplier = multiplier;
  currentStats = freshStats();
  savedStats = undefined;

  await onMessageCreate({
    author: { id: "user-1", bot: false },
    inGuild: () => true,
    guildId: "guild-1",
    client: {},
  } as never);

  assert.ok(savedStats);
  return savedStats;
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

async function awardVoiceSession(multiplier: number): Promise<unknown[] | undefined> {
  activeMultiplier = multiplier;
  voiceAward = undefined;
  endVoiceSession.mock.resetCalls();
  getActiveXpMultiplier.mock.resetCalls();

  const member = { id: "user-1", user: { bot: false } };
  await onVoiceStateUpdate(
    {
      channelId: "voice-1",
      member,
    } as never,
    {
      channelId: null,
      member,
      guild: { id: "guild-1" },
      client: {},
    } as never,
  );

  assert.equal(getActiveXpMultiplier.mock.callCount(), 1);
  assert.equal(endVoiceSession.mock.callCount(), 1);
  return voiceAward as unknown[] | undefined;
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
