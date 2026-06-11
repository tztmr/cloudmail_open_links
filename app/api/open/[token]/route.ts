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
  const requestStartedAt = Date.now();
  const traceId = globalThis.crypto?.randomUUID?.() || `open-mail-${requestStartedAt}`;
  const ensureStartedAt = Date.now();
  ensureSyncRuntimeStarted();
  // #region debug-point C:runtime-start
  fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'C', traceId, location: 'app/api/open/[token]/route.ts:GET', msg: '[DEBUG] ensured sync runtime', data: { ensureMs: Date.now() - ensureStartedAt, rss: typeof process !== 'undefined' ? process.memoryUsage().rss : null, heapUsed: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : null }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  const { token } = await params;
  const link = await getShareLinkByToken(token);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const now = Date.now();
  if (link.expires_at && now > new Date(link.expires_at).getTime()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  let syncResult: { fetched: number; inserted: number; skipped: number } | null = null;
  let syncError: string | null = null;
  let syncStatus: 'completed' | 'failed' | 'timed_out' | 'skipped_recent' | null = null;
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
      // #region debug-point D:warmup-scheduled
      fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'post-fix', hypothesisId: 'D', traceId, location: 'app/api/open/[token]/route.ts:warmup', msg: '[DEBUG] provider warmup scheduled', data: { mailbox: link.mailbox_email, providerId: provider.id, warmupEntryCount: openMailProviderWarmupCoordinator.getStats().entryCount }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      // #region debug-point A:provider-selected
      fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'A', traceId, location: 'app/api/open/[token]/route.ts:provider', msg: '[DEBUG] provider selected for open mail sync', data: { mailbox: link.mailbox_email, providerId: provider.id, providerDomain: provider.domain, elapsedMs: Date.now() - requestStartedAt }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      const syncOutcome = await openMailboxSyncCoordinator.sync({
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
      syncResult = syncOutcome.result;
      syncError = syncOutcome.error;
      syncStatus = syncOutcome.status;
      // #region debug-point A:sync-outcome
      fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'A', traceId, location: 'app/api/open/[token]/route.ts:sync-outcome', msg: '[DEBUG] open mail sync completed', data: { mailbox: link.mailbox_email, syncStatus, syncError, syncResult, elapsedMs: Date.now() - requestStartedAt }, ts: Date.now() }) }).catch(() => {});
      // #endregion
    }
  } catch (e: unknown) {
    syncError = e instanceof Error ? e.message : 'Sync failed';
    syncStatus = 'failed';
    // #region debug-point A:sync-error
    fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'A', traceId, location: 'app/api/open/[token]/route.ts:sync-error', msg: '[DEBUG] open mail sync threw error', data: { error: syncError, elapsedMs: Date.now() - requestStartedAt }, ts: Date.now() }) }).catch(() => {});
    // #endregion
  }

  const emails = await listReceivedForMailbox(link.mailbox_email, 1, link.owner_user_id);
  const currentEmailFingerprint = getEmailFingerprint(emails[0]);
  const consumeResult = await consumeShareLinkView(token, currentEmailFingerprint);
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
    sync: syncResult,
    sync_status: syncStatus,
    sync_error: syncError,
    _url: url,
  };

  // #region debug-point A:response-ready
  fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'open-mail-first-load', runId: 'pre-fix', hypothesisId: 'A', traceId, location: 'app/api/open/[token]/route.ts:response', msg: '[DEBUG] open mail response ready', data: { mailbox: link.mailbox_email, emailCount: emails.length, syncStatus, totalMs: Date.now() - requestStartedAt, rss: typeof process !== 'undefined' ? process.memoryUsage().rss : null, heapUsed: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : null }, ts: Date.now() }) }).catch(() => {});
  // #endregion

  if (wantJson) {
    return NextResponse.json(payload);
  }

  // default also json, the pretty UI is at the page
  return NextResponse.json(payload);
}
