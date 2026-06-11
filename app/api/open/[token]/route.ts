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
import { loadOpenMailboxView } from '@/lib/open-mail-view';
import { openMailProviderWarmupCoordinator } from '@/lib/open-provider-warmup';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

export const runtime = 'nodejs';
const OPEN_MAIL_SYNC_MAX_WAIT_MS = 1_500;
const OPEN_MAIL_SYNC_MIN_INTERVAL_MS = 4_000;
const OPEN_PROVIDER_WARMUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
const OPEN_MAIL_LIST_LIMIT = 20;

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
  }

  const { emails, consumeResult } = await loadOpenMailboxView({
    mailboxEmail: link.mailbox_email,
    ownerUserId: link.owner_user_id,
    token,
    mailboxKey: `${link.owner_user_id || 'global'}:${link.mailbox_email.trim().toLowerCase()}`,
    provider,
    syncMaxWaitMs: OPEN_MAIL_SYNC_MAX_WAIT_MS,
    syncMinIntervalMs: OPEN_MAIL_SYNC_MIN_INTERVAL_MS,
    listEmails: () => listReceivedForMailbox(link.mailbox_email, OPEN_MAIL_LIST_LIMIT, link.owner_user_id),
    consumeView: (shareToken, fingerprint) => consumeShareLinkView(shareToken, fingerprint),
    syncMailbox: ({ mailboxKey, maxWaitMs, minIntervalMs }) => openMailboxSyncCoordinator.sync({
      mailboxKey,
      maxWaitMs,
      minIntervalMs,
      run: async () => {
        if (!provider) {
          return { fetched: 0, inserted: 0, skipped: 0 };
        }

        return syncMailboxFromProvider({
          mailboxEmail: link.mailbox_email,
          provider,
          hasMessageId: (messageId) => hasReceivedEmailMessageId(link.mailbox_email, messageId, link.owner_user_id),
          saveEmail: (email) => insertReceivedEmail({ ...email, owner_user_id: link.owner_user_id }),
        });
      },
    }),
  });

  if (!consumeResult.ok) {
    return NextResponse.json({ error: 'View limit reached or link expired' }, { status: 429 });
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
