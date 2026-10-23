import type { XpEvent } from "../db/models/XpEvent.js";

export type XpEventStore = {
  getXpEvent(guildId: string): Promise<XpEvent | null>;
  getActiveXpEvents(): Promise<XpEvent[]>;
  updateActiveXpEvent(guildId: string, multiplier: number, endsAt: Date): Promise<XpEvent | null>;
  cancelActiveXpEvent(guildId: string): Promise<XpEvent | null>;
  expireXpEvent(guildId: string, now?: Date): Promise<XpEvent | null>;
};

type AnnouncementState = "live" | "cancelled" | "ended";

type TimerHandle = ReturnType<typeof setTimeout>;

export type XpEventRuntimeDependencies = {
  store: XpEventStore;
  syncAnnouncement(event: XpEvent, state: AnnouncementState): Promise<boolean>;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  onError?: (error: unknown, guildId: string, action: string) => void;
};

const MAX_TIMER_DELAY = 2_147_483_647;

export function createXpEventRuntime(dependencies: XpEventRuntimeDependencies) {
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const timers = new Map<string, TimerHandle>();

  function clearExpiry(guildId: string): void {
    const timer = timers.get(guildId);
    if (timer) clearTimer(timer);
    timers.delete(guildId);
  }

  async function expireAndAnnounce(guildId: string): Promise<XpEvent | null> {
    const expired = await dependencies.store.expireXpEvent(guildId, new Date(now()));
    if (!expired) return null;
    clearExpiry(guildId);
    await dependencies.syncAnnouncement(expired, "ended");
    return expired;
  }

  function schedule(event: XpEvent): void {
    clearExpiry(event.guildId);
    const delay = Math.min(MAX_TIMER_DELAY, Math.max(0, event.endsAt.getTime() - now()));
    const timer = setTimer(() => {
      void (async () => {
        try {
          const expired = await expireAndAnnounce(event.guildId);
          if (!expired) {
            const current = await dependencies.store.getXpEvent(event.guildId);
            if (current?.active) schedule(current);
          }
        } catch (error) {
          dependencies.onError?.(error, event.guildId, "expiry");
        }
      })();
    }, delay);
    if ("unref" in timer && typeof timer.unref === "function") timer.unref();
    timers.set(event.guildId, timer);
  }

  async function restore(): Promise<void> {
    for (const event of await dependencies.store.getActiveXpEvents()) {
      try {
        if (event.endsAt.getTime() <= now()) {
          await expireAndAnnounce(event.guildId);
        } else {
          schedule(event);
        }
      } catch (error) {
        dependencies.onError?.(error, event.guildId, "restore");
      }
    }
  }

  async function getLiveEvent(guildId: string): Promise<XpEvent | null> {
    const event = await dependencies.store.getXpEvent(guildId);
    if (!event?.active) return null;
    if (event.endsAt.getTime() <= now()) {
      await expireAndAnnounce(guildId);
      return null;
    }
    return event;
  }

  async function updateActiveEvent(
    guildId: string,
    multiplier: number,
    endsAt: Date,
  ): Promise<{ event: XpEvent; announcementSynced: boolean } | null> {
    const event = await dependencies.store.updateActiveXpEvent(guildId, multiplier, endsAt);
    if (!event) return null;
    schedule(event);
    return {
      event,
      announcementSynced: await dependencies.syncAnnouncement(event, "live"),
    };
  }

  async function cancelActiveEvent(
    guildId: string,
  ): Promise<{ event: XpEvent; announcementSynced: boolean } | null> {
    const event = await dependencies.store.cancelActiveXpEvent(guildId);
    if (!event) return null;
    clearExpiry(guildId);
    return {
      event,
      announcementSynced: await dependencies.syncAnnouncement(event, "cancelled"),
    };
  }

  async function getActiveXpMultiplier(guildId: string): Promise<number> {
    const event = await getLiveEvent(guildId);
    return event?.multiplier ?? 1;
  }

  return {
    cancelActiveEvent,
    expireAndAnnounce,
    getActiveXpMultiplier,
    getLiveEvent,
    restore,
    schedule,
    updateActiveEvent,
  };
}
