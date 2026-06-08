import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin';
import {
  createShareLink,
  deleteShareLink,
  getMailboxByEmail,
  hasReceivedEmailMessageId,
  insertReceivedEmail,
  listProviders,
  listReceivedForMailbox,
  listShareLinks,
  updateShareLinkLastEmailFingerprint,
} from '@/lib/db';
import { resolveProviderForMailbox, syncMailboxFromProvider } from '@/lib/mail-sync';
import { parseBatchShareLinkOptions } from '@/lib/share-link-settings';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

function getEmailFingerprint(email?: { message_id?: string | null; id?: string | null }) {
  return String(email?.message_id || email?.id || '').trim() || null;
}

export async function GET() {
  ensureSyncRuntimeStarted();
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const links = await listShareLinks(500, viewer.role === 'admin' ? undefined : viewer.id);
  return NextResponse.json({ success: true, shareLinks: links });
}

export async function POST(req: NextRequest) {
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { mailboxEmail, mailboxEmails } = body;
  const linkOptions = parseBatchShareLinkOptions(body);

  const emails = mailboxEmails || (mailboxEmail ? [mailboxEmail] : []);
  if (!emails.length) {
    return NextResponse.json({ error: 'mailboxEmail(s) required' }, { status: 400 });
  }

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const createdLinks = [];
  const urls = [];

  for (const email of emails) {
    if (!email || !email.includes('@')) continue;
    const normalizedEmail = String(email).trim().toLowerCase();
    const mailbox = await getMailboxByEmail(normalizedEmail);
    const ownerUserId = viewer.role === 'admin'
      ? (mailbox?.owner_user_id || viewer.id)
      : viewer.id;
    const ownedMailbox = await getMailboxByEmail(normalizedEmail, ownerUserId);
    const link = await createShareLink(
      normalizedEmail,
      linkOptions.maxViews,
      linkOptions.expiresInMinutes,
      ownerUserId,
    );

    try {
      const providers = await listProviders(ownerUserId);
      const provider = resolveProviderForMailbox(
        ownedMailbox || { email: normalizedEmail, provider_id: null },
        providers,
      );

      if (provider) {
        await syncMailboxFromProvider({
          mailboxEmail: normalizedEmail,
          provider,
          hasMessageId: (messageId) => hasReceivedEmailMessageId(normalizedEmail, messageId, ownerUserId),
          saveEmail: (receivedEmail) => insertReceivedEmail({ ...receivedEmail, owner_user_id: ownerUserId }),
        });
      }

      const latestEmail = (await listReceivedForMailbox(normalizedEmail, 1, ownerUserId))[0];
      await updateShareLinkLastEmailFingerprint(link.token, getEmailFingerprint(latestEmail));
    } catch {
      // Preloading latest email is best-effort; link creation itself should still succeed.
    }

    createdLinks.push(link);
    urls.push(`${base.replace(/\/$/, '')}/open/${link.token}`);
  }

  return NextResponse.json({ 
    success: true, 
    shareLink: createdLinks[0], 
    url: urls[0],
    shareLinks: createdLinks,
    urls
  });
}

export async function DELETE(req: NextRequest) {
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await deleteShareLink(id, viewer.role === 'admin' ? undefined : viewer.id);
  return NextResponse.json({ success: true });
}
