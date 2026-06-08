import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BATCH_LINK_EXPIRES_DAYS,
  DEFAULT_BATCH_LINK_MAX_VIEWS,
  parseBatchShareLinkOptions,
} from '../lib/share-link-settings.ts';

test('parseBatchShareLinkOptions 在未传值时使用默认 100 次和 30 天', () => {
  const options = parseBatchShareLinkOptions({});

  assert.equal(options.maxViews, DEFAULT_BATCH_LINK_MAX_VIEWS);
  assert.equal(options.expiresInDays, DEFAULT_BATCH_LINK_EXPIRES_DAYS);
  assert.equal(options.expiresInMinutes, 30 * 24 * 60);
});

test('parseBatchShareLinkOptions 优先使用传入的次数和天数覆盖默认值', () => {
  const options = parseBatchShareLinkOptions({
    maxViews: 12,
    expiresInDays: 7,
  });

  assert.equal(options.maxViews, 12);
  assert.equal(options.expiresInDays, 7);
  assert.equal(options.expiresInMinutes, 7 * 24 * 60);
});

test('parseBatchShareLinkOptions 兼容旧的分钟字段', () => {
  const options = parseBatchShareLinkOptions({
    maxViews: 9,
    expiresInMinutes: 180,
  });

  assert.equal(options.maxViews, 9);
  assert.equal(options.expiresInDays, 0);
  assert.equal(options.expiresInMinutes, 180);
});
