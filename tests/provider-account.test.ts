import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateMailboxAccount,
  inferEmailDomainFromProviderUrl,
} from '../lib/provider-account.ts';

test('inferEmailDomainFromProviderUrl 会从 provider 地址推断邮箱域名', () => {
  assert.equal(
    inferEmailDomainFromProviderUrl('https://mail.hidden-provider.example/api/public'),
    'hidden-provider.example'
  );
});

test('generateMailboxAccount 在未显式提供 emailDomain 时回退到推断结果', () => {
  const account = generateMailboxAccount('', 6, 'number', null, 'https://mail.hidden-provider.example/api/public');

  assert.match(account.email, /^[2345689]{6}@hidden-provider\.example$/);
  assert.match(account.password, /^[a-z2-9]{10}$/);
});
