import test from 'node:test';
import assert from 'node:assert/strict';

import { OPEN_MAIL_POLL_INTERVAL_MS } from '../lib/open-mail.ts';
import { normalizeSyncSettings } from '../lib/sync-scheduler.ts';

test('open page polls every 2 seconds by default', () => {
  assert.equal(OPEN_MAIL_POLL_INTERVAL_MS, 2_000);
});

test('sync scheduler defaults to a 2 second interval', () => {
  assert.deepEqual(normalizeSyncSettings(null), {
    enabled: true,
    interval_seconds: 2,
  });
});
