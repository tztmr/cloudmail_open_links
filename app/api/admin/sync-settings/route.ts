import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getSyncSetting, setSyncSetting } from '@/lib/db';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

async function verifyAdmin() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const settings = await getSyncSetting();
  await ensureSyncRuntimeStarted().refresh();
  return NextResponse.json({ success: true, settings });
}

export async function POST(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const settings = await setSyncSetting(Boolean(body.enabled));
  await ensureSyncRuntimeStarted().refresh();
  return NextResponse.json({ success: true, settings });
}
