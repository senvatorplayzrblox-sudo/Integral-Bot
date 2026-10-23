import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { endVoiceSession, UserStatsModel } from "./GuildMember.js";

test("voice XP applies an event multiplier once to the normal session total", async (t) => {
  const joinedAt = new Date("2025-01-01T00:00:00.000Z");
  const now = new Date(joinedAt.getTime() + 60_000);
  let update: Record<string, unknown> | undefined;
  const findOne = mock.method(UserStatsModel, "findOne", () => ({
    select: async () => ({ voiceJoinedAt: joinedAt, xp: 0 }),
  }) as never);
  const updateOne = mock.method(UserStatsModel, "updateOne", async (_filter: unknown, updateDoc: unknown) => {
    update = updateDoc as Record<string, unknown>;
    return {} as never;
  });
  const random = mock.method(Math, "random", () => 0.5);

  try {
    const result = await endVoiceSession("guild-1", "user-1", now, 3);

    assert.equal(result.minutes, 1);
    assert.equal(result.xpGained, 96, "four normal 8 XP voice chunks are multiplied once");
    assert.equal((update?.["$inc"] as Record<string, number>)["xp"], 96);
  } finally {
    findOne.mock.restore();
    updateOne.mock.restore();
    random.mock.restore();
  }

  await t.test("a multiplier of one leaves the normal voice total unchanged", async () => {
    const baseJoinedAt = new Date("2025-01-01T00:00:00.000Z");
    const baseNow = new Date(baseJoinedAt.getTime() + 60_000);
    let baseUpdate: Record<string, unknown> | undefined;
    const baseFindOne = mock.method(UserStatsModel, "findOne", () => ({
      select: async () => ({ voiceJoinedAt: baseJoinedAt, xp: 0 }),
    }) as never);
    const baseUpdateOne = mock.method(UserStatsModel, "updateOne", async (_filter: unknown, updateDoc: unknown) => {
      baseUpdate = updateDoc as Record<string, unknown>;
      return {} as never;
    });
    const baseRandom = mock.method(Math, "random", () => 0.5);

    try {
      const result = await endVoiceSession("guild-1", "user-1", baseNow, 1);

      assert.equal(result.xpGained, 32);
      assert.equal((baseUpdate?.["$inc"] as Record<string, number>)["xp"], 32);
    } finally {
      baseFindOne.mock.restore();
      baseUpdateOne.mock.restore();
      baseRandom.mock.restore();
    }
  });
});
