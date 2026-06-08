import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateShareLinkView } from '../lib/share-link-views.ts';

test('公开链接轮询时如果最新邮件没有变化则不扣查询次数', () => {
  assert.deepEqual(
    evaluateShareLinkView({
      maxViews: 5,
      viewsUsed: 2,
      lastEmailFingerprint: 'msg-1',
      currentEmailFingerprint: 'msg-1',
    }),
    {
      ok: true,
      shouldIncrement: false,
      nextViewsUsed: 2,
      nextLastEmailFingerprint: 'msg-1',
      remaining: 3,
    },
  );
});

test('公开链接轮询时如果出现新邮件则扣减一次查询次数并更新最新指纹', () => {
  assert.deepEqual(
    evaluateShareLinkView({
      maxViews: 5,
      viewsUsed: 2,
      lastEmailFingerprint: 'msg-1',
      currentEmailFingerprint: 'msg-2',
    }),
    {
      ok: true,
      shouldIncrement: true,
      nextViewsUsed: 3,
      nextLastEmailFingerprint: 'msg-2',
      remaining: 2,
    },
  );
});

test('公开链接轮询时如果有新邮件但次数已用完则拒绝继续消耗', () => {
  assert.deepEqual(
    evaluateShareLinkView({
      maxViews: 3,
      viewsUsed: 3,
      lastEmailFingerprint: 'msg-1',
      currentEmailFingerprint: 'msg-2',
    }),
    {
      ok: false,
      shouldIncrement: false,
      nextViewsUsed: 3,
      nextLastEmailFingerprint: 'msg-1',
      remaining: 0,
    },
  );
});
