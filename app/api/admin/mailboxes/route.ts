import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin';
import { bulkUpsertMailboxes, listMailboxes, upsertMailbox, listShareLinks, deleteMailboxes } from '@/lib/db';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

export async function DELETE(req: NextRequest) {
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const emails = searchParams.get('emails')?.split(',') || [];
  if (emails.length === 0) {
    return NextResponse.json({ error: 'No emails provided' }, { status: 400 });
  }

  await deleteMailboxes(emails, viewer.role === 'admin' ? undefined : viewer.id);
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  ensureSyncRuntimeStarted();
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const withLinks = searchParams.get('withLinks') === '1';
  const group = searchParams.get('group');
  const limit = parseInt(searchParams.get('limit') || '1000', 10);

  const ownerUserId = viewer.role === 'admin' ? undefined : viewer.id;
  const boxes = await listMailboxes(limit, group || undefined, ownerUserId);

  if (!withLinks) {
    return NextResponse.json({ success: true, mailboxes: boxes });
  }

  const links = await listShareLinks(500, ownerUserId);
  const byEmail = new Map<string, Awaited<ReturnType<typeof listShareLinks>>>();
  for (const l of links) {
    const arr = byEmail.get(l.mailbox_email) || [];
    arr.push(l);
    byEmail.set(l.mailbox_email, arr);
  }

  const enriched = boxes.map((m) => ({
    ...m,
    shareLinks: byEmail.get(m.email) || [],
  }));
  return NextResponse.json({ success: true, mailboxes: enriched });
}

export async function POST(req: NextRequest) {
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { emails, note, mode, group } = body as { emails?: string; note?: string; mode?: string; group?: string };

  if (mode === 'single') {
    const email = String(body.email || '').trim();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    const m = await upsertMailbox(email, note, body.password ?? null, body.source, null, group, viewer.role === 'admin' ? viewer.id : viewer.id);
    return NextResponse.json({ success: true, mailbox: m });
  }

  // bulk
  const list = String(emails || '')
    .split(/\r?\n|,|;|\s+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
  if (list.length === 0) {
    return NextResponse.json({ error: 'No valid emails' }, { status: 400 });
  }
  const created = await bulkUpsertMailboxes(list, note, body.source ?? 'import', null, group, viewer.id);
  const all = await listMailboxes(1000, undefined, viewer.role === 'admin' ? undefined : viewer.id);
  return NextResponse.json({ success: true, created, total: all.length, mailboxes: all });
}
