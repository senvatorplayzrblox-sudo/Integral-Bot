import assert from "node:assert/strict";
import { test } from "node:test";
import type { Guild } from "discord.js";
import {
  buildXpEventAnnouncement,
  calculateBoostedXp,
  formatXpEventDuration,
  parseXpEventDuration,
} from "./xpEvent.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

test("parses day, hour, and minute durations including zero-valued fields", () => {
  assert.equal(parseXpEventDuration("25", "0", "0"), 25 * DAY_MS);
  assert.equal(parseXpEventDuration("0", "0", "25"), 25 * MINUTE_MS);
  assert.equal(parseXpEventDuration("2", "5", "30"), 2 * DAY_MS + 5 * HOUR_MS + 30 * MINUTE_MS);
});

test("rejects blank, fractional, negative, unsafe, and zero-total durations", () => {
  const invalidDurations: Array<[string, string, string]> = [
    ["", "1", "0"],
    ["1", " ", "0"],
    ["1.5", "0", "0"],
    ["-1", "0", "0"],
    ["9007199254740992", "0", "0"],
    ["0", "0", "0"],
  ];
  for (const invalid of invalidDurations) {
    assert.equal(parseXpEventDuration(...invalid), null);
  }
});

test("formats the full duration and applies the supported multiplier range", () => {
  assert.equal(formatXpEventDuration(25 * DAY_MS), "25 Days | 0 Hours | 0 Minutes");
  assert.equal(calculateBoostedXp(20, 25), 500);
  assert.equal(calculateBoostedXp(20, 10_000), 200_000);
  assert.throws(() => calculateBoostedXp(20, 10_001), RangeError);
});

test("live announcement includes status, total duration, Discord timestamps, multiplier, and host", () => {
  const startedAt = new Date("2026-10-01T00:00:00.000Z");
  const endsAt = new Date(startedAt.getTime() + 2 * DAY_MS + 5 * HOUR_MS + 30 * MINUTE_MS);
  const guild = {
    emojis: { cache: { find: () => undefined } },
  } as unknown as Guild;

  const announcement = buildXpEventAnnouncement(guild, {
    multiplier: 10_000,
    startedAt,
    endsAt,
    hostId: "host-1",
  });

  assert.match(announcement, /XP OVERDRIVE IS LIVE/);
  assert.match(announcement, /Status: \*\*Active\*\*/);
  assert.match(announcement, /Boost: \*\*10000× XP\*\*/);
  assert.match(announcement, /Total duration: \*\*2 Days \| 5 Hours \| 30 Minutes\*\*/);
  assert.match(announcement, new RegExp(`Ends: <t:${Math.floor(endsAt.getTime() / 1000)}:F>`));
  assert.match(announcement, new RegExp(`Time remaining: <t:${Math.floor(endsAt.getTime() / 1000)}:R>`));
  assert.match(announcement, /Hosted by: <@host-1>/);
});
