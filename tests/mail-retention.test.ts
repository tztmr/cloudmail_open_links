import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectReceivedEmailIdsToDelete,
  getDelayUntilNextDailyRun,
} from '../lib/mail-retention.ts';

test('每天清理邮件时每个邮箱只保留最新一封', () => {
  const toDelete = collectReceivedEmailIdsToDelete([
    { id: 'a-3', owner_user_id: 'user-a', mailbox_email: 'a@example.com', received_at: '2026-06-10T00:02:00.000Z' },
    { id: 'a-2', owner_user_id: 'user-a', mailbox_email: 'a@example.com', received_at: '2026-06-10T00:01:00.000Z' },
    { id: 'a-1', owner_user_id: 'user-a', mailbox_email: 'a@example.com', received_at: '2026-06-10T00:00:00.000Z' },
    { id: 'b-2', owner_user_id: 'user-a', mailbox_email: 'b@example.com', received_at: '2026-06-10T00:03:00.000Z' },
    { id: 'b-1', owner_user_id: 'user-a', mailbox_email: 'b@example.com', received_at: '2026-06-10T00:01:00.000Z' },
    { id: 'c-1', owner_user_id: 'user-b', mailbox_email: 'a@example.com', received_at: '2026-06-10T00:04:00.000Z' },
  ]);

  assert.deepEqual(toDelete, ['a-2', 'a-1', 'b-1']);
});

test('定点清理会计算到下一次凌晨三点的等待时间', () => {
  const now = new Date('2026-06-09T01:30:00.000Z');
  assert.equal(getDelayUntilNextDailyRun(now, 3), 90 * 60 * 1000);
});

test('错过当日定点后会顺延到第二天同一时间', () => {
  const now = new Date('2026-06-09T04:15:00.000Z');
  assert.equal(getDelayUntilNextDailyRun(now, 3), ((22 * 60) + 45) * 60 * 1000);
});
