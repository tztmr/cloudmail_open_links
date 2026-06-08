import test from 'node:test';
import assert from 'node:assert/strict';

import { getBootstrapRequestsForRole } from '../lib/mailbox-admin-utils.ts';

test('普通用户初始化后台页面时不请求仅管理员可访问的同步设置接口', () => {
  assert.deepEqual(getBootstrapRequestsForRole('user'), {
    loadUsers: false,
    loadSyncSettings: false,
  });
});

test('管理员初始化后台页面时会请求用户列表和同步设置', () => {
  assert.deepEqual(getBootstrapRequestsForRole('admin'), {
    loadUsers: true,
    loadSyncSettings: true,
  });
});
