import test from 'node:test';
import assert from 'node:assert/strict';

import { createSyncScheduler, normalizeSyncSettings } from '../lib/sync-scheduler.ts';

test('normalizeSyncSettings 在未配置时默认开启并使用 60 秒间隔', () => {
  assert.deepEqual(normalizeSyncSettings(null), {
    enabled: true,
    interval_seconds: 60,
  });
});

test('createSyncScheduler 在开启状态下立即执行一次并按 60 秒注册轮询', async () => {
  let runCount = 0;
  const timers: Array<{ ms: number; cb: () => Promise<void> | void }> = [];
  const scheduler = createSyncScheduler({
    loadSettings: async () => ({ enabled: true, interval_seconds: 60 }),
    runSync: async () => {
      runCount++;
      return { total_mailboxes: 3, synced_mailboxes: 2, unmatched_mailboxes: 1, fetched: 4, inserted: 3, skipped: 1 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIntervalFn: ((cb: any, ms: any) => {
      timers.push({ cb: cb as () => Promise<void> | void, ms });
      return timers.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    clearIntervalFn: () => {},
  });

  await scheduler.refresh();

  assert.equal(runCount, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 60000);

  await timers[0].cb();
  assert.equal(runCount, 2);
});

test('createSyncScheduler 在关闭后会清掉已有轮询', async () => {
  let enabled = true;
  const cleared: number[] = [];
  const scheduler = createSyncScheduler({
    loadSettings: async () => ({ enabled, interval_seconds: 60 }),
    runSync: async () => ({ total_mailboxes: 0, synced_mailboxes: 0, unmatched_mailboxes: 0, fetched: 0, inserted: 0, skipped: 0 }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIntervalFn: (() => 7) as any,
    clearIntervalFn: (timerId) => {
      cleared.push(Number(timerId));
    },
  });

  await scheduler.refresh();
  enabled = false;
  await scheduler.refresh();

  assert.deepEqual(cleared, [7]);
  assert.equal(scheduler.getState().running, false);
});
