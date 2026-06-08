import { NextRequest, NextResponse } from 'next/server';
import {
  getMailboxByEmail,
  getShareLinkByToken,
  hasReceivedEmailMessageId,
  incrementShareView,
  insertReceivedEmail,
  listProviders,
  listReceivedForMailbox,
} from '@/lib/db';
import { resolveProviderForMailbox, syncMailboxFromProvider } from '@/lib/mail-sync';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

export const runtime = 'nodejs';

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

  const inc = await incrementShareView(token);
  if (!inc.ok) {
    return NextResponse.json({ error: 'View limit reached or link expired' }, { status: 429 });
  }

  let syncResult: { fetched: number; inserted: number; skipped: number } | null = null;
  let syncError: string | null = null;
  try {
    const mailbox = await getMailboxByEmail(link.mailbox_email, link.owner_user_id);
    const providers = await listProviders(link.owner_user_id);
    const provider = resolveProviderForMailbox(
      mailbox || { email: link.mailbox_email, provider_id: null },
      providers
    );

    if (provider) {
      syncResult = await syncMailboxFromProvider({
        mailboxEmail: link.mailbox_email,
        provider,
        hasMessageId: (messageId) => hasReceivedEmailMessageId(link.mailbox_email, messageId, link.owner_user_id),
        saveEmail: (email) => insertReceivedEmail({ ...email, owner_user_id: link.owner_user_id }),
      });
    }
  } catch (e: unknown) {
    syncError = e instanceof Error ? e.message : 'Sync failed';
  }

  const emails = await listReceivedForMailbox(link.mailbox_email, 1, link.owner_user_id);

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
      views_used: link.views_used + (inc.ok ? 1 : 0),
      remaining: inc.remaining,
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
    sync_error: syncError,
    _url: url,
  };

  if (wantJson) {
    return NextResponse.json(payload);
  }

  // default also json, the pretty UI is at the page
  return NextResponse.json(payload);
}
