import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScopedFilter,
  createPasswordHash,
  createSessionValue,
  getAuthMode,
  verifyPassword,
  verifySessionValue,
  type AuthUser,
} from '../lib/auth.ts';

const adminUser: AuthUser = {
  id: 'admin-1',
  username: 'root',
  role: 'admin',
};

const normalUser: AuthUser = {
  id: 'user-1',
  username: 'alice',
  role: 'user',
};

test('getAuthMode 在没有任何用户时进入管理员初始化模式', () => {
  assert.equal(getAuthMode(0), 'bootstrap');
  assert.equal(getAuthMode(1), 'login');
});

test('buildScopedFilter 对管理员不过滤 owner，对普通用户追加 owner 过滤', () => {
  assert.deepEqual(buildScopedFilter(adminUser, { group: 'team-a' }), { group: 'team-a' });
  assert.deepEqual(buildScopedFilter(normalUser, { group: 'team-a' }), {
    group: 'team-a',
    owner_user_id: 'user-1',
  });
});

test('createPasswordHash / verifyPassword 能正确校验密码', async () => {
  const hashed = await createPasswordHash('s3cret!');

  assert.notEqual(hashed, 's3cret!');
  assert.equal(await verifyPassword('s3cret!', hashed), true);
  assert.equal(await verifyPassword('wrong-password', hashed), false);
});

test('createSessionValue / verifySessionValue 能校验并拒绝伪造 session', () => {
  const secret = 'session-secret';
  const value = createSessionValue('user-1', secret);

  assert.equal(verifySessionValue(value, secret), 'user-1');
  assert.equal(verifySessionValue(`${value}x`, secret), null);
  assert.equal(verifySessionValue(value, 'other-secret'), null);
});
