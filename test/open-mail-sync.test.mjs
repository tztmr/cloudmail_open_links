import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenMailboxSyncCoordinator } from '../lib/open-mail-sync.ts';

test('returns completed result when sync finishes within wait budget', async () => {
  const coordinator = createOpenMailboxSyncCoordinator();

  const result = await coordinator.sync({
    mailboxKey: 'user@example.com',
    run: async () => ({ fetched: 1, inserted: 1, skipped: 0 }),
    maxWaitMs: 100,
    minIntervalMs: 1_000,
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.result, { fetched: 1, inserted: 1, skipped: 0 });
});

test('reuses in-flight sync instead of starting a duplicate request', async () => {
  const coordinator = createOpenMailboxSyncCoordinator();
  let runCount = 0;
  let resolveRun = null;

  const run = async () => {
    runCount += 1;
    return await new Promise((resolve) => {
      resolveRun = resolve;
    });
  };

  const first = coordinator.sync({
    mailboxKey: 'user@example.com',
    run,
    maxWaitMs: 5,
    minIntervalMs: 1_000,
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  const second = coordinator.sync({
    mailboxKey: 'user@example.com',
    run,
    maxWaitMs: 100,
    minIntervalMs: 1_000,
  });

  resolveRun({ fetched: 1, inserted: 1, skipped: 0 });

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(runCount, 1);
  assert.equal(firstResult.status, 'timed_out');
  assert.equal(secondResult.status, 'completed');
  assert.deepEqual(secondResult.result, { fetched: 1, inserted: 1, skipped: 0 });
});

test('skips re-syncing when the mailbox was just synced recently', async () => {
  const coordinator = createOpenMailboxSyncCoordinator();
  let runCount = 0;

  const run = async () => {
    runCount += 1;
    return { fetched: 1, inserted: 1, skipped: 0 };
  };

  const first = await coordinator.sync({
    mailboxKey: 'user@example.com',
    run,
    maxWaitMs: 100,
    minIntervalMs: 10_000,
  });

  const second = await coordinator.sync({
    mailboxKey: 'user@example.com',
    run,
    maxWaitMs: 100,
    minIntervalMs: 10_000,
  });

  assert.equal(runCount, 1);
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'skipped_recent');
  assert.deepEqual(second.result, { fetched: 1, inserted: 1, skipped: 0 });
});

test('evicts stale mailbox entries to avoid unbounded memory growth', async () => {
  let now = 1_000;
  const coordinator = createOpenMailboxSyncCoordinator(() => now, {
    staleAfterMs: 50,
    maxEntries: 2,
  });

  await coordinator.sync({
    mailboxKey: 'user1@example.com',
    run: async () => ({ fetched: 1, inserted: 1, skipped: 0 }),
    maxWaitMs: 100,
    minIntervalMs: 0,
  });

  now += 60;

  await coordinator.sync({
    mailboxKey: 'user2@example.com',
    run: async () => ({ fetched: 1, inserted: 1, skipped: 0 }),
    maxWaitMs: 100,
    minIntervalMs: 0,
  });

  await coordinator.sync({
    mailboxKey: 'user3@example.com',
    run: async () => ({ fetched: 1, inserted: 1, skipped: 0 }),
    maxWaitMs: 100,
    minIntervalMs: 0,
  });

  assert.equal(coordinator.getStats().entryCount, 2);
});
