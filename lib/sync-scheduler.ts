import type { SyncAllMailboxesResult } from '@/lib/mail-sync';

export type SyncSettings = {
  enabled: boolean;
  interval_seconds: number;
};

type SyncSchedulerDeps = {
  loadSettings: () => Promise<SyncSettings | null | undefined>;
  runSync: () => Promise<SyncAllMailboxesResult>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

type SyncSchedulerState = {
  running: boolean;
  settings: SyncSettings;
  last_result: SyncAllMailboxesResult | null;
  last_error: string | null;
  in_progress: boolean;
};

export function normalizeSyncSettings(value: Partial<SyncSettings> | null | undefined): SyncSettings {
  return {
    enabled: value?.enabled ?? true,
    interval_seconds: 60,
  };
}

export function createSyncScheduler({
  loadSettings,
  runSync,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}: SyncSchedulerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let state: SyncSchedulerState = {
    running: false,
    settings: normalizeSyncSettings(null),
    last_result: null,
    last_error: null,
    in_progress: false,
  };

  async function execute() {
    if (state.in_progress) return;
    state = { ...state, in_progress: true };
    try {
      const result = await runSync();
      state = {
        ...state,
        last_result: result,
        last_error: null,
      };
    } catch (error: unknown) {
      state = {
        ...state,
        last_error: error instanceof Error ? error.message : 'Sync failed',
      };
    } finally {
      state = { ...state, in_progress: false };
    }
  }

  function stop() {
    if (timer) {
      clearIntervalFn(timer);
      timer = null;
    }
    state = { ...state, running: false };
  }

  async function refresh() {
    const settings = normalizeSyncSettings(await loadSettings());
    state = { ...state, settings };

    if (!settings.enabled) {
      stop();
      return state;
    }

    if (!timer) {
      await execute();
      timer = setIntervalFn(() => {
        void execute();
      }, settings.interval_seconds * 1000);
    }

    state = { ...state, running: true };
    return state;
  }

  return {
    refresh,
    stop,
    getState: () => state,
  };
}
