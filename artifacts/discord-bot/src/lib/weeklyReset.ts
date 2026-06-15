import mongoose from "mongoose";
import { logger } from "./logger.js";
import { getConfig, setConfig } from "../db/models/BotConfig.js";

const LAST_RESET_KEY = "lastWeeklyReset";

function mostRecentMondayUTC(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function nextMondayUTC(): Date {
  const monday = mostRecentMondayUTC();
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

async function runReset(): Promise<void> {
  logger.info("Running weekly stats reset…");

  const db = mongoose.connection.db;
  if (!db) {
    logger.error("Cannot run weekly reset: no DB connection");
    return;
  }

  const result = await db
    .collection("userstats")
    .updateMany({}, { $set: { weeklyMessages: 0, weeklyVoiceMinutes: 0 } });

  await setConfig(LAST_RESET_KEY, new Date().toISOString());

  logger.info({ modified: result.modifiedCount }, "Weekly reset complete");
}

function scheduleNextReset(): void {
  const next = nextMondayUTC();
  const msUntilNext = next.getTime() - Date.now();

  logger.info(
    { nextReset: next.toISOString(), inMs: msUntilNext },
    "Next weekly reset scheduled",
  );

  setTimeout(() => {
    void runReset().then(() => scheduleNextReset());
  }, msUntilNext);
}

export async function startWeeklyResetScheduler(): Promise<void> {
  const lastResetStr = await getConfig(LAST_RESET_KEY);
  const lastReset = lastResetStr ? new Date(lastResetStr) : new Date(0);
  const mostRecentMonday = mostRecentMondayUTC();

  if (lastReset < mostRecentMonday) {
    logger.info(
      { lastReset: lastReset.toISOString(), mostRecentMonday: mostRecentMonday.toISOString() },
      "Missed weekly reset detected — running now",
    );
    await runReset();
  } else {
    logger.info(
      { lastReset: lastReset.toISOString() },
      "Weekly reset already ran for this week",
    );
  }

  scheduleNextReset();
}
