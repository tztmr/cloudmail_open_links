import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { addUsers, generateDynmslAccount, type AddUsersResponse, type ProviderCreds } from '@/lib/dynmsl';
import { upsertMailbox, createShareLink, getProvider } from '@/lib/db';

export const runtime = 'nodejs';

type DynmslCreateBody = {
  count?: number;
  prefix?: string;
  charType?: 'number' | 'english' | 'mixed';
  charLength?: number;
  maxViews?: number;
  expiresInMinutes?: number;
  note?: string;
  group?: string;
  providerId?: string;
};

type CreatedAccountResult = {
  email: string;
  password: string;
  mailboxId: string;
  provider: string;
  shareLink: {
    token: string;
    url: string;
    max_views: number;
    expires_at: string | null;
  };
};

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as DynmslCreateBody;

    const count = Math.min(Math.max(Number(body.count) || 5, 1), 100);
    const prefix = String(body.prefix || '').trim();
    const charType = (body.charType || 'mixed') as 'number' | 'english' | 'mixed';
    const charLength = Math.min(Math.max(Number(body.charLength) || 8, 4), 20);

    const linkMaxViews = Math.max(0, Number(body.maxViews || 0));
    const linkExpiresMin = Math.max(0, Number(body.expiresInMinutes || 0));

    // Resolve provider (preferred) or fall back to env
    let creds: ProviderCreds | undefined;
    let providerName = 'env';
    let emailDomain: string | null = null;
    if (body.providerId) {
      const prov = await getProvider(String(body.providerId));
      if (!prov) {
        return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
      }
      creds = {
        domain: prov.domain,
        token: prov.token,
      };
      providerName = prov.name;
      emailDomain = prov.email_domain || null;
    }

    // 1. Generate accounts (respect provider emailDomain if set)
    const accounts: Array<{ email: string; password: string }> = [];
    for (let i = 0; i < count; i++) {
      const acc = generateDynmslAccount(prefix, charLength, charType, emailDomain);
      accounts.push(acc);
    }

    // 2. Call upstream with the right creds
    let upstreamOk = false;
    let upstreamResult: AddUsersResponse | null = null;
    try {
      upstreamResult = await addUsers(accounts, creds);
      const code = upstreamResult?.code;
      upstreamOk =
        upstreamResult?.success === true ||
        code === 200 || code === 0 || code === '200' || code === '0' ||
        (upstreamResult?.message || '').toLowerCase().includes('success');
    } catch (error: unknown) {
      return NextResponse.json({
        success: false,
        error: `Upstream creation failed: ${error instanceof Error ? error.message : String(error)}`,
        upstream: upstreamResult,
      }, { status: 502 });
    }

    if (!upstreamOk) {
      return NextResponse.json({
        success: false,
        error: 'Upstream returned non-success',
        upstream: upstreamResult,
      }, { status: 502 });
    }

    // 3. Save locally + auto create share links
    const results: CreatedAccountResult[] = [];
    const base = process.env.PUBLIC_BASE_URL || '';

    for (const acc of accounts) {
      const mb = await upsertMailbox(
        acc.email,
        body.note || providerName,
        acc.password,
        'dynmsl',
        body.providerId || null,
        body.group || null
      );

      const link = await createShareLink(acc.email, linkMaxViews, linkExpiresMin);

      const openUrl = base
        ? `${base.replace(/\/$/, '')}/open/${link.token}`
        : `/open/${link.token}`;

      results.push({
        email: acc.email,
        password: acc.password,
        mailboxId: mb.id,
        provider: providerName,
        shareLink: {
          token: link.token,
          url: openUrl,
          max_views: link.max_views,
          expires_at: link.expires_at,
        },
      });
    }

    return NextResponse.json({
      success: true,
      created: results.length,
      provider: providerName,
      accounts: results,
      upstream: upstreamResult,
    });

  } catch (error: unknown) {
    console.error('dynmsl create error', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal error',
    }, { status: 500 });
  }
}
