type WarmTask = () => Promise<void>;

type WarmArgs = {
  providerKey: string;
  run: WarmTask;
  minIntervalMs: number;
};

type WarmEntry = {
  inFlight: Promise<void> | null;
  lastWarmedAt: number;
};

type WarmCoordinatorOptions = {
  staleAfterMs?: number;
  maxEntries?: number;
};

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

export function createOpenMailProviderWarmupCoordinator(
  nowImpl: () => number = Date.now,
  {
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  }: WarmCoordinatorOptions = {}
) {
  const entries = new Map<string, WarmEntry>();

  function pruneEntries(now: number) {
    for (const [key, entry] of entries) {
      if (!entry.inFlight && entry.lastWarmedAt > 0 && now - entry.lastWarmedAt >= staleAfterMs) {
        entries.delete(key);
      }
    }

    if (entries.size <= maxEntries) return;

    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries) break;
      if (entry.inFlight) continue;
      entries.delete(key);
    }
  }

  function getEntry(providerKey: string) {
    const existing = entries.get(providerKey);
    if (existing) {
      entries.delete(providerKey);
      entries.set(providerKey, existing);
      return existing;
    }

    const created: WarmEntry = {
      inFlight: null,
      lastWarmedAt: 0,
    };
    entries.set(providerKey, created);
    return created;
  }

  async function warm({
    providerKey,
    run,
    minIntervalMs,
  }: WarmArgs) {
    const now = nowImpl();
    pruneEntries(now);
    const entry = getEntry(providerKey);

    if (entry.inFlight) {
      return entry.inFlight;
    }

    if (entry.lastWarmedAt > 0 && now - entry.lastWarmedAt < minIntervalMs) {
      return;
    }

    const promise = Promise.resolve()
      .then(run)
      .finally(() => {
        entry.lastWarmedAt = nowImpl();
        entry.inFlight = null;
        pruneEntries(nowImpl());
      });

    entry.inFlight = promise;
    return promise;
  }

  return {
    warm,
    getStats: () => ({
      entryCount: entries.size,
    }),
  };
}

export const openMailProviderWarmupCoordinator = createOpenMailProviderWarmupCoordinator();
