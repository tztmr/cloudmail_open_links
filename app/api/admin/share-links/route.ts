import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createShareLink, listShareLinks } from '@/lib/db';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

export async function GET() {
  ensureSyncRuntimeStarted();
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const links = await listShareLinks(500);
  return NextResponse.json({ success: true, shareLinks: links });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { mailboxEmail, mailboxEmails, maxViews, expiresInMinutes } = body;

  const emails = mailboxEmails || (mailboxEmail ? [mailboxEmail] : []);
  if (!emails.length) {
    return NextResponse.json({ error: 'mailboxEmail(s) required' }, { status: 400 });
  }

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const createdLinks = [];
  const urls = [];

  for (const email of emails) {
    if (!email || !email.includes('@')) continue;
    const link = await createShareLink(
      email,
      Number(maxViews) || 0,
      Number(expiresInMinutes) || 0
    );
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
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const ShareLink = (await import('@/models/ShareLink')).default;
  await ShareLink.deleteOne({ _id: id });
  return NextResponse.json({ success: true });
}
