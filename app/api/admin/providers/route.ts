import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin';
import { listProviders, bulkImportProviders, deleteProvider, upsertProvider } from '@/lib/db';
import { ensureSyncRuntimeStarted } from '@/lib/sync-runtime';

type ProviderImportItem = {
  id: string;
  name: string;
  domain: string;
  token: string;
  emailDomain?: string | null;
  email_domain?: string | null;
};

export async function GET() {
  ensureSyncRuntimeStarted();
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providers = await listProviders(viewer.role === 'admin' ? undefined : viewer.id);
  return NextResponse.json({ success: true, providers });
}

export async function POST(req: NextRequest) {
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Support two modes:
  // 1. Single provider
  // 2. JSON array import (the format user pasted)
  if (Array.isArray(body)) {
    // bulk import from the exact JSON the user has
    const normalized = (body as ProviderImportItem[]).map((provider) => ({
      id: String(provider.id),
      name: String(provider.name),
      domain: String(provider.domain),
      token: String(provider.token),
      emailDomain: provider.emailDomain || provider.email_domain || undefined,
    }));
    const count = await bulkImportProviders(normalized, viewer.id);
    const all = await listProviders(viewer.role === 'admin' ? undefined : viewer.id);
    return NextResponse.json({ success: true, imported: count, providers: all });
  }

  // single
  const { id, name, domain, token, emailDomain } = body;
  if (!id || !name || !domain || !token) {
    return NextResponse.json({ error: 'id, name, domain, token are required' }, { status: 400 });
  }

  const prov = await upsertProvider({
    id: String(id),
    name: String(name),
    domain: String(domain),
    token: String(token),
    email_domain: emailDomain || null,
  }, viewer.id);

  return NextResponse.json({ success: true, provider: prov });
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

  await deleteProvider(id, viewer.role === 'admin' ? undefined : viewer.id);
  return NextResponse.json({ success: true });
}
