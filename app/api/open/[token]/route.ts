import { NextRequest, NextResponse } from 'next/server';
import {
  consumeShareLinkView,
  getMailboxByEmail,
  getShareLinkByToken,
  hasReceivedEmailMessageId,
  insertReceivedEmail,
  listProviders,
  listReceivedForMailbox,
} from '@/lib/db';
import { resolveProviderForMailbox, syncMailboxFromProvider, warmProviderConnection } from '@/lib/mail-sync';
import { openMailboxSyncCoordinator } from '@/lib/open-mail-sync';
import { openMailProviderWarmupCoordinator } from '@/lib/open-provider-warmup';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

export const runtime = 'nodejs';
const OPEN_MAIL_SYNC_MAX_WAIT_MS = 2_500;
const OPEN_MAIL_SYNC_MIN_INTERVAL_MS = 10_000;
const OPEN_PROVIDER_WARMUP_MIN_INTERVAL_MS = 5 * 60 * 1000;

function getEmailFingerprint(email?: { message_id?: string | null; id?: string | null }) {
  return String(email?.message_id || email?.id || '').trim() || null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  ensureSyncRuntimeStarted();
  const { token } = await params;
  const link = await getShareLinkByToken(token);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const now = Date.now();
  if (link.expires_at && now > new Date(link.expires_at).getTime()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  // 先查库返回已有邮件，不阻塞用户
  const emails = await listReceivedForMailbox(link.mailbox_email, 1, link.owner_user_id);
  const currentEmailFingerprint = getEmailFingerprint(emails[0]);
  const consumeResult = await consumeShareLinkView(token, currentEmailFingerprint);
  if (!consumeResult.ok) {
    return NextResponse.json({ error: 'View limit reached or link expired' }, { status: 429 });
  }

  // 后台补同步 + 预热，不阻塞响应
  try {
    const mailbox = await getMailboxByEmail(link.mailbox_email, link.owner_user_id);
    const providers = await listProviders(link.owner_user_id);
    const provider = resolveProviderForMailbox(
      mailbox || { email: link.mailbox_email, provider_id: null },
      providers
    );

    if (provider) {
      void openMailProviderWarmupCoordinator.warm({
        providerKey: provider.id || provider.domain,
        minIntervalMs: OPEN_PROVIDER_WARMUP_MIN_INTERVAL_MS,
        run: () => warmProviderConnection(provider),
      });

      void openMailboxSyncCoordinator.sync({
        mailboxKey: `${link.owner_user_id || 'global'}:${link.mailbox_email.trim().toLowerCase()}`,
        maxWaitMs: OPEN_MAIL_SYNC_MAX_WAIT_MS,
        minIntervalMs: OPEN_MAIL_SYNC_MIN_INTERVAL_MS,
        run: () => syncMailboxFromProvider({
          mailboxEmail: link.mailbox_email,
          provider,
          hasMessageId: (messageId) => hasReceivedEmailMessageId(link.mailbox_email, messageId, link.owner_user_id),
          saveEmail: (email) => insertReceivedEmail({ ...email, owner_user_id: link.owner_user_id }),
        }),
      });
    }
  } catch {
    // 后台同步失败不影响已有数据返回
  }

  const base = process.env.PUBLIC_BASE_URL || '';
  const url = base ? `${base.replace(/\/$/, '')}/open/${token}` : null;

  const { searchParams } = new URL(req.url);
  const wantJson = searchParams.get('format') === 'json' || searchParams.get('type') === 'json';

  const payload = {
    success: true,
    mailbox: link.mailbox_email,
    link: {
      token: link.token,
      max_views: link.max_views,
      views_used: consumeResult.views_used ?? link.views_used,
      remaining: consumeResult.remaining,
      expires_at: link.expires_at,
    },
    emails: emails.map((e) => ({
      id: e.id,
      from: e.from_name ? `${e.from_name} <${e.from_addr || ''}>` : e.from_addr,
      from_addr: e.from_addr,
      subject: e.subject,
      received_at: e.received_at,
      text_preview: (e.text_body || '').slice(0, 300),
      has_html: !!e.html_body,
      has_raw: !!e.raw,
    })),
    _url: url,
  };

  if (wantJson) {
    return NextResponse.json(payload);
  }

  return NextResponse.json(payload);
}
