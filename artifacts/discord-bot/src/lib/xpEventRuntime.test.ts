import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "discord.js";
import { createXpEventRepository, type XpEvent } from "../db/models/XpEvent.js";
import { syncAnnouncement } from "./xpEvent.js";
import { createXpEventRuntime } from "./xpEventRuntime.js";

type Query = Record<string, unknown>;

class InMemoryMongoModel {
  readonly rows = new Map<string, XpEvent>();

  async findOne(filter: Query): Promise<XpEvent | null> {
    const row = [...this.rows.values()].find((candidate) => matches(candidate, filter));
    return row ? structuredClone(row) : null;
  }

  async find(filter: Query): Promise<XpEvent[]> {
    return [...this.rows.values()]
      .filter((candidate) => matches(candidate, filter))
      .map((candidate) => structuredClone(candidate));
  }

  async updateOne(
    filter: Query,
    update: { $setOnInsert?: Partial<XpEvent>; $set?: Partial<XpEvent> },
    options?: { upsert?: boolean },
  ): Promise<void> {
    let row = [...this.rows.values()].find((candidate) => matches(candidate, filter));
    if (!row && options?.upsert) {
      const guildId = String(filter.guildId);
      row = {
        guildId,
        active: false,
        multiplier: 1,
        endsAt: new Date(0),
        hostId: "",
        startedAt: new Date(0),
        announcementChannelId: "",
        announcementMessageId: "",
        ...update.$setOnInsert,
      };
      this.rows.set(guildId, row);
    }
    if (row && update.$set) Object.assign(row, update.$set);
  }

  async findOneAndUpdate(
    filter: Query,
    update: { $set: Partial<XpEvent> },
    options?: { returnDocument?: "before" | "after" },
  ): Promise<XpEvent | null> {
    const row = [...this.rows.values()].find((candidate) => matches(candidate, filter));
    if (!row) return null;
    const before = structuredClone(row);
    Object.assign(row, update.$set);
    return options?.returnDocument === "before" ? before : structuredClone(row);
  }
}

function matches(row: XpEvent, filter: Query): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") {
      if (!Array.isArray(expected) || !expected.some((clause) => matches(row, clause as Query))) {
        return false;
      }
      continue;
    }
    const actual = row[key as keyof XpEvent];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      for (const [operator, operand] of Object.entries(expected)) {
        const actualValue = actual instanceof Date ? actual.getTime() : actual;
        const operandValue = operand instanceof Date ? operand.getTime() : operand;
        if (operator === "$ne" && actualValue === operandValue) return false;
        if (operator === "$gt" && !(actualValue! > operandValue!)) return false;
        if (operator === "$lte" && !(actualValue! <= operandValue!)) return false;
      }
    } else if (actual instanceof Date && expected instanceof Date) {
      if (actual.getTime() !== expected.getTime()) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function createTestRepository() {
  const model = new InMemoryMongoModel();
  const repository = createXpEventRepository(model as never);
  return { model, repository };
}

function eventFor(guildId: string, endsAt: Date): Omit<XpEvent, "active" | "startedAt"> {
  return {
    guildId,
    multiplier: 3,
    endsAt,
    hostId: "admin-1",
    announcementChannelId: `channel-${guildId}`,
    announcementMessageId: `message-${guildId}`,
  };
}

function createRuntime(
  repository: ReturnType<typeof createTestRepository>["repository"],
  now: () => number,
  syncAnnouncement: (event: XpEvent, state: "live" | "cancelled" | "ended") => Promise<boolean>,
  timerDelays: number[] = [],
) {
  return createXpEventRuntime({
    store: repository,
    now,
    syncAnnouncement,
    setTimer: (_callback, delay) => {
      timerDelays.push(delay);
      return { unref() {} } as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {},
  });
}

function createAnnouncementClient(guildId: string, channelId: string, messageId: string) {
  const messages = new Map<string, string>();
  const announcementMessage = {
    edit: async ({ content }: { content: string }) => {
      messages.set(messageId, content);
    },
  };
  const channel = {
    id: channelId,
    guildId,
    isTextBased: () => true,
    messages: {
      fetch: async (id: string) => (id === messageId ? announcementMessage : null),
    },
  };
  const client = {
    channels: { fetch: async () => channel },
    guilds: {
      cache: {
        get: () => ({ emojis: { cache: { find: () => undefined } } }),
      },
    },
  } as unknown as Client;
  return { client, messages };
}

test("allows only one concurrent active event per guild while allowing other guilds", async () => {
  const { repository } = createTestRepository();
  const endsAt = new Date(Date.now() + 60_000);
  const starts = await Promise.all([
    repository.startXpEvent(eventFor("guild-1", endsAt)),
    repository.startXpEvent({ ...eventFor("guild-1", endsAt), multiplier: 10 }),
    repository.startXpEvent(eventFor("guild-2", endsAt)),
  ]);

  assert.equal(starts.filter(Boolean).length, 2);
  const activeEvents = await repository.getActiveXpEvents();
  assert.deepEqual(new Set(activeEvents.map((event) => event.guildId)), new Set(["guild-1", "guild-2"]));
  assert.equal(activeEvents.filter((event) => event.guildId === "guild-1").length, 1);
});

test("persists the full supported multiplier range and rejects invalid values", async () => {
  const { repository } = createTestRepository();
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + 25 * 24 * 60 * 60_000);
  const started = await repository.startXpEvent({
    ...eventFor("guild-max-multiplier", endsAt),
    multiplier: 10_000,
    startedAt,
  });

  assert.equal(started?.multiplier, 10_000);
  assert.equal(started?.startedAt.getTime(), startedAt.getTime());
  assert.equal(started?.endsAt.getTime(), endsAt.getTime());
  await assert.rejects(
    repository.startXpEvent({ ...eventFor("guild-invalid-start", endsAt), multiplier: 10_001 }),
    RangeError,
  );
  await assert.rejects(
    repository.startXpEvent({ ...eventFor("guild-invalid-low-start", endsAt), multiplier: 1 }),
    RangeError,
  );
  await assert.rejects(
    repository.updateActiveXpEvent("guild-max-multiplier", 10_001, endsAt),
    RangeError,
  );
  await assert.rejects(
    repository.updateActiveXpEvent("guild-max-multiplier", 1, endsAt),
    RangeError,
  );
});

test("updates and cancellation persist state and synchronize the matching announcement", async () => {
  const { repository } = createTestRepository();
  const now = Date.now();
  await repository.startXpEvent(eventFor("guild-update", new Date(now + 3_600_000)));
  const { client, messages } = createAnnouncementClient(
    "guild-update",
    "channel-guild-update",
    "message-guild-update",
  );
  const syncAndVerifyStoredState = async (event: XpEvent, state: "live" | "cancelled" | "ended") => {
    const stored = await repository.getXpEvent(event.guildId);
    if (state === "live") {
      assert.equal(stored?.multiplier, event.multiplier);
      assert.equal(stored?.endsAt.getTime(), event.endsAt.getTime());
    } else {
      assert.equal(stored?.active, false);
    }
    return syncAnnouncement(client, event, state);
  };
  const verifiedRuntime = createRuntime(repository, () => now, syncAndVerifyStoredState);

  const updated = await verifiedRuntime.updateActiveEvent(
    "guild-update",
    12,
    new Date(now + 30 * 24 * 60 * 60_000),
  );
  assert.ok(updated);
  assert.equal(updated.event.multiplier, 12);
  const liveAnnouncement = messages.get("message-guild-update") ?? "";
  assert.match(liveAnnouncement, /Status: \*\*Active\*\*/);
  assert.match(liveAnnouncement, /Boost: \*\*12× XP\*\*/);
  assert.match(liveAnnouncement, /Total duration:/);
  assert.match(liveAnnouncement, /Ends: <t:\d+:F>/);
  assert.match(liveAnnouncement, /Time remaining: <t:\d+:R>/);
  assert.match(liveAnnouncement, /Hosted by: <@admin-1>/);

  const cancelled = await verifiedRuntime.cancelActiveEvent("guild-update");
  assert.ok(cancelled);
  assert.equal(cancelled.event.active, true, "the cancellation result carries the pre-update announcement details");
  assert.equal((await repository.getXpEvent("guild-update"))?.active, false);
  const cancelledAnnouncement = messages.get("message-guild-update") ?? "";
  assert.match(cancelledAnnouncement, /XP OVERDRIVE WAS CANCELLED/);
  assert.match(cancelledAnnouncement, /Status: \*\*Inactive \(cancelled\)\*\*/);
  assert.match(cancelledAnnouncement, /Total duration:/);
  assert.match(cancelledAnnouncement, /Scheduled end: <t:\d+:F>/);
  assert.match(cancelledAnnouncement, /Time remaining: Not applicable \(cancelled\)/);
  assert.match(cancelledAnnouncement, /Hosted by: <@admin-1>/);
});

test("restores an expired event after restart, stops its multiplier, and ends its announcement", async () => {
  const { repository } = createTestRepository();
  const now = Date.now();
  await repository.startXpEvent(eventFor("guild-expired", new Date(now - 1_000)));
  const { client, messages } = createAnnouncementClient(
    "guild-expired",
    "channel-guild-expired",
    "message-guild-expired",
  );
  const restartedRuntime = createRuntime(repository, () => now, (event, state) =>
    syncAnnouncement(client, event, state));

  await restartedRuntime.restore();

  assert.equal((await repository.getXpEvent("guild-expired"))?.active, false);
  const endedAnnouncement = messages.get("message-guild-expired") ?? "";
  assert.match(endedAnnouncement, /XP OVERDRIVE HAS ENDED/);
  assert.match(endedAnnouncement, /Status: \*\*Inactive \(ended\)\*\*/);
  assert.match(endedAnnouncement, /Total duration:/);
  assert.match(endedAnnouncement, /Scheduled end: <t:\d+:F>/);
  assert.match(endedAnnouncement, /Time remaining: 0 minutes/);
  assert.match(endedAnnouncement, /Hosted by: <@admin-1>/);
  assert.equal(await restartedRuntime.getActiveXpMultiplier("guild-expired"), 1);
});

test("restores a future multi-day event after restart with its multiplier and expiry timer", async () => {
  const { repository } = createTestRepository();
  const now = Date.now();
  const endsAt = new Date(now + 25 * 24 * 60 * 60_000);
  const started = await repository.startXpEvent({
    ...eventFor("guild-restored-future", endsAt),
    multiplier: 10_000,
  });
  assert.ok(started);

  const delays: number[] = [];
  const restartedRuntime = createRuntime(repository, () => now, async () => true, delays);
  await restartedRuntime.restore();

  assert.deepEqual(delays, [2_147_483_647]);
  assert.equal(await restartedRuntime.getActiveXpMultiplier("guild-restored-future"), 10_000);
  assert.equal((await repository.getXpEvent("guild-restored-future"))?.endsAt.getTime(), endsAt.getTime());
});

test("caps a long event timer at Node's maximum delay instead of repeatedly firing early", async () => {
  const { repository } = createTestRepository();
  const now = Date.now();
  await repository.startXpEvent(eventFor("guild-long", new Date(now + 60_000)));
  const delays: number[] = [];
  const runtime = createRuntime(repository, () => now, async () => true, delays);

  const result = await runtime.updateActiveEvent(
    "guild-long",
    5,
    new Date(now + 30 * 24 * 60 * 60_000),
  );

  assert.ok(result);
  assert.deepEqual(delays, [2_147_483_647]);
});
