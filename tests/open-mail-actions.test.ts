import test from 'node:test';
import assert from 'node:assert/strict';

import { copyTextToClipboard, extractVerificationCode } from '../lib/open-mail.ts';

test('extractVerificationCode 会优先从主题提取 4 到 8 位验证码', () => {
  const code = extractVerificationCode({
    subject: '698854 是您的验证码',
    text_body: '验证码可能稍后失效',
    html_body: '<p>code: 123456</p>',
  });

  assert.equal(code, '698854');
});

test('extractVerificationCode 会在主题缺失时回退到正文 HTML 或文本', () => {
  const code = extractVerificationCode({
    subject: null,
    text_body: null,
    html_body: '<div><strong>您的验证码是 246810</strong></div>',
  });

  assert.equal(code, '246810');
});

test('copyTextToClipboard 会调用剪贴板 writeText', async () => {
  let copied = '';

  await copyTextToClipboard(
    {
      writeText: async (value: string) => {
        copied = value;
      },
    },
    'demo@example.com',
  );

  assert.equal(copied, 'demo@example.com');
});
