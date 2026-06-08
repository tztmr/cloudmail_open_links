import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findUsersByUsername,
  getMailboxLinkKey,
} from '../lib/mailbox-admin-utils.ts';

const users = [
  { id: 'u-1', username: 'alice' },
  { id: 'u-2', username: 'alicia' },
  { id: 'u-3', username: 'bob' },
  { id: 'u-4', username: 'superalice' },
];

test('findUsersByUsername 支持模糊搜索，并优先返回更接近的用户名', () => {
  assert.deepEqual(
    findUsersByUsername(users, '  ALI '),
    [
      { id: 'u-1', username: 'alice' },
      { id: 'u-2', username: 'alicia' },
      { id: 'u-4', username: 'superalice' },
    ],
  );
});

test('findUsersByUsername 在空关键字时不返回建议', () => {
  assert.deepEqual(findUsersByUsername(users, '   '), []);
});

test('getMailboxLinkKey 会把 owner 和邮箱一起作为管理员视图下的唯一键', () => {
  assert.equal(getMailboxLinkKey('u-1', 'Same@Example.com'), 'u-1::same@example.com');
  assert.equal(getMailboxLinkKey('u-2', 'same@example.com'), 'u-2::same@example.com');
  assert.notEqual(
    getMailboxLinkKey('u-1', 'same@example.com'),
    getMailboxLinkKey('u-2', 'same@example.com'),
  );
});
