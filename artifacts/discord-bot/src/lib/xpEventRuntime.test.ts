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
  assert.match(messages.get("message-guild-update") ?? "", /Boost: \*\*12× XP\*\*/);

  const cancelled = await verifiedRuntime.cancelActiveEvent("guild-update");
  assert.ok(cancelled);
  assert.equal(cancelled.event.active, true, "the cancellation result carries the pre-update announcement details");
  assert.equal((await repository.getXpEvent("guild-update"))?.active, false);
  assert.match(messages.get("message-guild-update") ?? "", /XP OVERDRIVE WAS CANCELLED/);
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
  assert.match(messages.get("message-guild-expired") ?? "", /XP OVERDRIVE HAS ENDED/);
  assert.equal(await restartedRuntime.getActiveXpMultiplier("guild-expired"), 1);
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
