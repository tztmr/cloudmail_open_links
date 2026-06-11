type SyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
};

type SyncStatus = 'completed' | 'failed' | 'timed_out' | 'skipped_recent';

type SyncOutcome = {
  status: SyncStatus;
  result: SyncResult | null;
  error: string | null;
};

type SyncTask = () => Promise<SyncResult>;

type SyncArgs = {
  mailboxKey: string;
  run: SyncTask;
  maxWaitMs: number;
  minIntervalMs: number;
};

type SyncEntry = {
  inFlight: Promise<SyncResult> | null;
  lastCompletedAt: number;
  lastResult: SyncResult | null;
  lastError: string | null;
};

type OpenMailboxSyncCoordinatorOptions = {
  staleAfterMs?: number;
  maxEntries?: number;
};

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Sync failed';
}

function createTimedWait<T>(promise: Promise<T>, maxWaitMs: number) {
  if (maxWaitMs <= 0) {
    return Promise.resolve<{ kind: 'timeout' | 'result' | 'error'; value?: T; error?: unknown }>({
      kind: 'timeout',
    });
  }

  return new Promise<{ kind: 'timeout' | 'result' | 'error'; value?: T; error?: unknown }>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ kind: 'timeout' });
    }, maxWaitMs);

    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ kind: 'result', value });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ kind: 'error', error });
      }
    );
  });
}

export function createOpenMailboxSyncCoordinator(
  nowImpl: () => number = Date.now,
  {
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  }: OpenMailboxSyncCoordinatorOptions = {}
) {
  const entries = new Map<string, SyncEntry>();

  function pruneEntries(now: number) {
    for (const [key, entry] of entries) {
      if (!entry.inFlight && entry.lastCompletedAt > 0 && now - entry.lastCompletedAt >= staleAfterMs) {
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

  function getEntry(mailboxKey: string) {
    const existing = entries.get(mailboxKey);
    if (existing) {
      entries.delete(mailboxKey);
      entries.set(mailboxKey, existing);
      return existing;
    }

    const created: SyncEntry = {
      inFlight: null,
      lastCompletedAt: 0,
      lastResult: null,
      lastError: null,
    };
    entries.set(mailboxKey, created);
    // #region debug-point B:entry-created
    fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'B', location: 'lib/open-mail-sync.ts:getEntry', msg: '[DEBUG] coordinator entry created', data: { mailboxKey, entryCount: entries.size, rss: typeof process !== 'undefined' ? process.memoryUsage().rss : null, heapUsed: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : null }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    return created;
  }

  async function waitForResult(entry: SyncEntry, maxWaitMs: number): Promise<SyncOutcome> {
    if (!entry.inFlight) {
      return {
        status: entry.lastError ? 'failed' : 'skipped_recent',
        result: entry.lastResult,
        error: entry.lastError,
      };
    }

    const waited = await createTimedWait(entry.inFlight, maxWaitMs);
    if (waited.kind === 'timeout') {
      return {
        status: 'timed_out',
        result: entry.lastResult,
        error: null,
      };
    }

    if (waited.kind === 'error') {
      return {
        status: 'failed',
        result: entry.lastResult,
        error: getErrorMessage(waited.error),
      };
    }

    return {
      status: 'completed',
      result: waited.value ?? null,
      error: null,
    };
  }

  async function sync({
    mailboxKey,
    run,
    maxWaitMs,
    minIntervalMs,
  }: SyncArgs): Promise<SyncOutcome> {
    const now = nowImpl();
    pruneEntries(now);
    const entry = getEntry(mailboxKey);

    // #region debug-point B:sync-start
    fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'B', location: 'lib/open-mail-sync.ts:sync:start', msg: '[DEBUG] coordinator sync requested', data: { mailboxKey, entryCount: entries.size, hasInFlight: !!entry.inFlight, hasLastResult: !!entry.lastResult, ageMs: entry.lastCompletedAt > 0 ? now - entry.lastCompletedAt : null }, ts: Date.now() }) }).catch(() => {});
    // #endregion

    if (entry.inFlight) {
      return waitForResult(entry, maxWaitMs);
    }

    if (
      entry.lastResult &&
      entry.lastCompletedAt > 0 &&
      now - entry.lastCompletedAt < minIntervalMs
    ) {
      return {
        status: 'skipped_recent',
        result: entry.lastResult,
        error: null,
      };
    }

    const promise = Promise.resolve()
      .then(run)
      .then(
        (result) => {
          entry.lastCompletedAt = nowImpl();
          entry.lastResult = result;
          entry.lastError = null;
          entry.inFlight = null;
          pruneEntries(entry.lastCompletedAt);
          // #region debug-point B:sync-finished
          fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'B', location: 'lib/open-mail-sync.ts:sync:finished', msg: '[DEBUG] coordinator sync finished', data: { mailboxKey, entryCount: entries.size, lastCompletedAt: entry.lastCompletedAt, rss: typeof process !== 'undefined' ? process.memoryUsage().rss : null, heapUsed: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : null }, ts: Date.now() }) }).catch(() => {});
          // #endregion
          return result;
        },
        (error: unknown) => {
          entry.lastCompletedAt = nowImpl();
          entry.lastError = getErrorMessage(error);
          entry.inFlight = null;
          pruneEntries(entry.lastCompletedAt);
          // #region debug-point B:sync-failed
          fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'B', location: 'lib/open-mail-sync.ts:sync:failed', msg: '[DEBUG] coordinator sync failed', data: { mailboxKey, entryCount: entries.size, error: entry.lastError }, ts: Date.now() }) }).catch(() => {});
          // #endregion
          throw error;
        }
      );

    entry.inFlight = promise;
    return waitForResult(entry, maxWaitMs);
  }

  return {
    sync,
    getStats: () => ({
      entryCount: entries.size,
    }),
  };
}

export const openMailboxSyncCoordinator = createOpenMailboxSyncCoordinator();
