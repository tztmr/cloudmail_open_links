import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOpenData } from '../lib/open-mail.ts';

test('normalizeOpenData 会把邮件列表 id 统一转成字符串', () => {
  const normalized = normalizeOpenData({
    success: true,
    mailbox: 'demo@hidden-provider.example',
    emails: [
      { id: 123, subject: 'hello', received_at: '2026-06-09T00:00:00.000Z' },
      { id: '456', subject: 'world', received_at: '2026-06-09T00:01:00.000Z' },
    ],
  });

  assert.deepEqual(normalized.emails?.map((email) => email.id), ['123', '456']);
});
