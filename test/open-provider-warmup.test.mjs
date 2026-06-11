import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenMailProviderWarmupCoordinator } from '../lib/open-provider-warmup.ts';

test('reuses an in-flight provider warmup request', async () => {
  const coordinator = createOpenMailProviderWarmupCoordinator();
  let runCount = 0;
  let resolveRun = null;

  const run = async () => {
    runCount += 1;
    return await new Promise((resolve) => {
      resolveRun = resolve;
    });
  };

  const first = coordinator.warm({
    providerKey: 'provider-1',
    run,
    minIntervalMs: 60_000,
  });

  const second = coordinator.warm({
    providerKey: 'provider-1',
    run,
    minIntervalMs: 60_000,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveRun();
  await Promise.all([first, second]);

  assert.equal(runCount, 1);
});

test('skips repeated provider warmup when it ran recently', async () => {
  let now = 1_000;
  const coordinator = createOpenMailProviderWarmupCoordinator(() => now);
  let runCount = 0;

  const run = async () => {
    runCount += 1;
  };

  await coordinator.warm({
    providerKey: 'provider-1',
    run,
    minIntervalMs: 60_000,
  });

  now += 100;

  await coordinator.warm({
    providerKey: 'provider-1',
    run,
    minIntervalMs: 60_000,
  });

  assert.equal(runCount, 1);
});
