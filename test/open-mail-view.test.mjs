import test from 'node:test';
import assert from 'node:assert/strict';

import { loadOpenMailboxView } from '../lib/open-mail-view.ts';

test('syncs before reading emails and consuming a view', async () => {
  const callOrder = [];

  const result = await loadOpenMailboxView({
    mailboxEmail: 'user@example.com',
    ownerUserId: 'owner-1',
    token: 'token-1',
    mailboxKey: 'owner-1:user@example.com',
    provider: { id: 'provider-1' },
    syncMaxWaitMs: 1000,
    syncMinIntervalMs: 4000,
    listEmails: async () => {
      callOrder.push('listEmails');
      return [{ id: 'mail-2', message_id: 'msg-2' }];
    },
    consumeView: async (_token, fingerprint) => {
      callOrder.push(`consumeView:${fingerprint}`);
      return { ok: true, remaining: 9, views_used: 1 };
    },
    syncMailbox: async () => {
      callOrder.push('syncMailbox');
      return { status: 'completed', result: { fetched: 1, inserted: 1, skipped: 0 }, error: null };
    },
  });

  assert.deepEqual(callOrder, ['syncMailbox', 'listEmails', 'consumeView:msg-2']);
  assert.equal(result.consumeResult.ok, true);
  assert.equal(result.emails[0].id, 'mail-2');
});

test('still returns cached emails when sync times out', async () => {
  const result = await loadOpenMailboxView({
    mailboxEmail: 'user@example.com',
    ownerUserId: 'owner-1',
    token: 'token-1',
    mailboxKey: 'owner-1:user@example.com',
    provider: { id: 'provider-1' },
    syncMaxWaitMs: 1000,
    syncMinIntervalMs: 4000,
    listEmails: async () => [{ id: 'mail-1', message_id: 'msg-1' }],
    consumeView: async () => ({ ok: true, remaining: 9, views_used: 1 }),
    syncMailbox: async () => ({ status: 'timed_out', result: null, error: null }),
  });

  assert.equal(result.syncStatus, 'timed_out');
  assert.equal(result.emails[0].id, 'mail-1');
});
