import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveProviderForMailbox,
  syncAllMailboxesFromProviders,
  syncMailboxFromProvider,
  type SaveReceivedEmailInput,
} from '../lib/mail-sync.ts';

test('resolveProviderForMailbox 优先使用 mailbox 上绑定的 provider_id', () => {
  const provider = resolveProviderForMailbox(
    { email: 'bound@dynmsl.com', provider_id: 'p-2' },
    [
      { id: 'p-1', name: 'A', domain: 'https://a.example.com/api/public', token: 't1', email_domain: 'dynmsl.com' },
      { id: 'p-2', name: 'B', domain: 'https://b.example.com/api/public', token: 't2', email_domain: 'altmail.com' },
    ]
  );

  assert.equal(provider?.id, 'p-2');
});

test('resolveProviderForMailbox 在未绑定 provider 时按 email_domain 推断', () => {
  const provider = resolveProviderForMailbox(
    { email: 'guess@dynmsl.com', provider_id: null },
    [
      { id: 'p-1', name: 'A', domain: 'https://a.example.com/api/public', token: 't1', email_domain: 'dynmsl.com' },
      { id: 'p-2', name: 'B', domain: 'https://b.example.com/api/public', token: 't2', email_domain: 'other.com' },
    ]
  );

  assert.equal(provider?.id, 'p-1');
});

test('resolveProviderForMailbox 兼容旧 provider 数据，从 domain 自动推断邮箱域名', () => {
  const provider = resolveProviderForMailbox(
    { email: 'legacy@dynmsl.com', provider_id: null },
    [
      { id: 'p-1', name: 'DynMSL', domain: 'https://mail.dynmsl.com', token: 't1', email_domain: null },
      { id: 'p-2', name: 'HAVCD', domain: 'https://mail.havcd.com', token: 't2', email_domain: null },
    ]
  );

  assert.equal(provider?.id, 'p-1');
});

test('syncMailboxFromProvider 调用 emailList 并只写入新邮件', async () => {
  const saved: SaveReceivedEmailInput[] = [];
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];

  const result = await syncMailboxFromProvider({
    mailboxEmail: 'target@dynmsl.com',
    provider: {
      id: 'p-1',
      name: 'DynMSL',
      domain: 'https://mail.dynmsl.com/api/public',
      token: 'secret-token',
      email_domain: 'dynmsl.com',
    },
    fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body || '{}')),
      });

      return new Response(JSON.stringify({
        code: 200,
        message: 'success',
        data: [
          {
            emailId: 1001,
            sendEmail: 'alpha@example.com',
            sendName: 'Alpha',
            subject: 'old message',
            toEmail: 'target@dynmsl.com',
            createTime: '2026-06-09 03:45:06',
            type: 0,
            content: '<div>old</div>',
            text: 'old',
            isDel: 0,
          },
          {
            emailId: 1002,
            sendEmail: 'beta@example.com',
            sendName: 'Beta',
            subject: 'new message',
            toEmail: 'target@dynmsl.com',
            createTime: '2026-06-09 04:00:00',
            type: 0,
            content: '<div>new</div>',
            text: 'new',
            isDel: 0,
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    hasMessageId: async (messageId: string) => messageId === 'upstream:1001',
    saveEmail: async (email: SaveReceivedEmailInput) => {
      saved.push(email);
      return `saved-${saved.length}`;
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://mail.dynmsl.com/api/public/emailList');
  assert.equal(requests[0].headers.get('authorization'), 'secret-token');
  assert.deepEqual(requests[0].body, {
    toEmail: 'target@dynmsl.com',
    type: 0,
    isDel: 0,
    timeSort: 'desc',
    num: 1,
    size: 100,
  });

  assert.deepEqual(result, {
    fetched: 2,
    inserted: 1,
    skipped: 1,
  });

  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], {
    mailbox_email: 'target@dynmsl.com',
    message_id: 'upstream:1002',
    from_addr: 'beta@example.com',
    from_name: 'Beta',
    to_addr: 'target@dynmsl.com',
    subject: 'new message',
    text_body: 'new',
    html_body: '<div>new</div>',
    raw: null,
    received_at: '2026-06-09T04:00:00.000Z',
  });
});

test('syncMailboxFromProvider 兼容旧 provider domain，自动补 api/public 前缀', async () => {
  let requestedUrl = '';

  await syncMailboxFromProvider({
    mailboxEmail: 'target@dynmsl.com',
    provider: {
      id: 'p-1',
      name: 'DynMSL',
      domain: 'https://mail.dynmsl.com',
      token: 'secret-token',
      email_domain: null,
    },
    fetchImpl: async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ code: 200, message: 'success', data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    hasMessageId: async () => false,
    saveEmail: async () => 'saved-1',
  });

  assert.equal(requestedUrl, 'https://mail.dynmsl.com/api/public/emailList');
});

test('syncAllMailboxesFromProviders 只同步能匹配到 provider 的邮箱', async () => {
  const calls: Array<{ mailboxEmail: string; providerId: string }> = [];

  const stats = await syncAllMailboxesFromProviders({
    mailboxes: [
      { email: 'first@dynmsl.com', provider_id: null },
      { email: 'second@unknown.com', provider_id: null },
    ],
    providers: [
      { id: 'p-1', name: 'DynMSL', domain: 'https://mail.dynmsl.com/api/public', token: 'secret-token', email_domain: 'dynmsl.com' },
    ],
    syncMailbox: async ({ mailboxEmail, provider }) => {
      calls.push({ mailboxEmail, providerId: provider.id });
      return { fetched: 2, inserted: 1, skipped: 1 };
    },
  });

  assert.deepEqual(calls, [
    { mailboxEmail: 'first@dynmsl.com', providerId: 'p-1' },
  ]);

  assert.deepEqual(stats, {
    total_mailboxes: 2,
    synced_mailboxes: 1,
    unmatched_mailboxes: 1,
    fetched: 2,
    inserted: 1,
    skipped: 1,
  });
});
