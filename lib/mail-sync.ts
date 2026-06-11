import crypto from 'node:crypto';

export type SyncProvider = {
  id: string;
  name: string;
  domain: string;
  token: string;
  email_domain: string | null;
};

export type SyncMailbox = {
  email: string;
  provider_id?: string | null;
  owner_user_id?: string;
};

export type SaveReceivedEmailInput = {
  mailbox_email: string;
  message_id?: string | null;
  from_addr?: string | null;
  from_name?: string | null;
  to_addr?: string | null;
  subject?: string | null;
  text_body?: string | null;
  html_body?: string | null;
  raw?: string | null;
  received_at?: string | null;
};

type UpstreamEmailItem = {
  emailId?: string | number | null;
  sendEmail?: string | null;
  sendName?: string | null;
  subject?: string | null;
  toEmail?: string | null;
  createTime?: string | null;
  type?: number | null;
  content?: string | null;
  text?: string | null;
  isDel?: number | null;
};

type SyncArgs = {
  mailboxEmail: string;
  provider: SyncProvider;
  fetchImpl?: typeof fetch;
  hasMessageId: (messageId: string) => Promise<boolean>;
  saveEmail: (email: SaveReceivedEmailInput) => Promise<string>;
  limit?: number;
};

export type SyncAllMailboxesArgs = {
  mailboxes: SyncMailbox[];
  providers: SyncProvider[];
  syncMailbox: (args: { mailboxEmail: string; ownerUserId?: string; provider: SyncProvider }) => Promise<{
    fetched: number;
    inserted: number;
    skipped: number;
  }>;
};

export type SyncAllMailboxesResult = {
  total_mailboxes: number;
  synced_mailboxes: number;
  unmatched_mailboxes: number;
  fetched: number;
  inserted: number;
  skipped: number;
};

function normalizePublicApiBase(url: string) {
  const trimmed = url.replace(/\/+$/, '');
  return /\/api\/public$/i.test(trimmed) ? trimmed : `${trimmed}/api/public`;
}

function buildMessageId(mailboxEmail: string, item: UpstreamEmailItem) {
  if (item.emailId !== undefined && item.emailId !== null && String(item.emailId).trim()) {
    return `upstream:${String(item.emailId).trim()}`;
  }

  const basis = [
    mailboxEmail.toLowerCase(),
    item.toEmail || '',
    item.sendEmail || '',
    item.subject || '',
    item.createTime || '',
    item.text || '',
    item.content || '',
  ].join('|');

  return `upstream-hash:${crypto.createHash('sha1').update(basis).digest('hex')}`;
}

function toIsoString(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoLike = trimmed.includes('T')
    ? trimmed
    : `${trimmed.replace(' ', 'T')}Z`;
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function inferEmailDomainFromProvider(provider: SyncProvider) {
  const explicit = provider.email_domain?.trim().toLowerCase();
  if (explicit) return explicit;

  try {
    const hostname = new URL(provider.domain).hostname.toLowerCase();
    return hostname.replace(/^mail\./, '');
  } catch {
    return null;
  }
}

export async function warmProviderConnection(
  provider: SyncProvider,
  fetchImpl: typeof fetch = fetch
) {
  const endpoint = normalizePublicApiBase(provider.domain);
  await fetchImpl(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });
}

export function resolveProviderForMailbox(mailbox: SyncMailbox, providers: SyncProvider[]) {
  if (mailbox.provider_id) {
    const exact = providers.find((provider) => provider.id === mailbox.provider_id);
    if (exact) return exact;
  }

  const email = mailbox.email.trim().toLowerCase();
  const byDomain = providers.filter((provider) => {
    const domain = inferEmailDomainFromProvider(provider);
    return !!domain && email.endsWith(`@${domain}`);
  });

  if (byDomain.length === 1) return byDomain[0];
  return null;
}

export async function syncMailboxFromProvider({
  mailboxEmail,
  provider,
  fetchImpl = fetch,
  hasMessageId,
  saveEmail,
  limit = 100,
}: SyncArgs) {
  const normalizedEmail = mailboxEmail.trim().toLowerCase();
  const endpoint = `${normalizePublicApiBase(provider.domain)}/emailList`;

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: provider.token,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
    },
    body: JSON.stringify({
      toEmail: normalizedEmail,
      type: 0,
      isDel: 0,
      timeSort: 'desc',
      num: 1,
      size: limit,
    }),
  });

  if (!res.ok) {
    throw new Error(`Upstream sync failed: ${res.status}`);
  }

  const payload = await res.json() as { code?: number | string; message?: string; data?: UpstreamEmailItem[] };
  const ok = payload?.code === 200 || payload?.code === '200' || String(payload?.message || '').toLowerCase() === 'success';
  if (!ok) {
    throw new Error(payload?.message || 'Upstream sync failed');
  }

  const items = Array.isArray(payload?.data) ? payload.data : [];
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    if ((item.isDel ?? 0) !== 0) {
      skipped++;
      continue;
    }
    if ((item.type ?? 0) !== 0) {
      skipped++;
      continue;
    }
    if (String(item.toEmail || '').trim().toLowerCase() !== normalizedEmail) {
      skipped++;
      continue;
    }

    const messageId = buildMessageId(normalizedEmail, item);
    if (await hasMessageId(messageId)) {
      skipped++;
      continue;
    }

    await saveEmail({
      mailbox_email: normalizedEmail,
      message_id: messageId,
      from_addr: item.sendEmail?.trim() || null,
      from_name: item.sendName?.trim() || null,
      to_addr: normalizedEmail,
      subject: item.subject?.trim() || null,
      text_body: item.text ?? null,
      html_body: item.content ?? null,
      raw: null,
      received_at: toIsoString(item.createTime),
    });
    inserted++;
  }

  return {
    fetched: items.length,
    inserted,
    skipped,
  };
}

export async function syncAllMailboxesFromProviders({
  mailboxes,
  providers,
  syncMailbox,
}: SyncAllMailboxesArgs): Promise<SyncAllMailboxesResult> {
  const totals: SyncAllMailboxesResult = {
    total_mailboxes: mailboxes.length,
    synced_mailboxes: 0,
    unmatched_mailboxes: 0,
    fetched: 0,
    inserted: 0,
    skipped: 0,
  };

  for (const mailbox of mailboxes) {
    const provider = resolveProviderForMailbox(mailbox, providers);
    if (!provider) {
      totals.unmatched_mailboxes++;
      continue;
    }

    const result = await syncMailbox({
      mailboxEmail: mailbox.email,
      ownerUserId: mailbox.owner_user_id,
      provider,
    });

    totals.synced_mailboxes++;
    totals.fetched += result.fetched;
    totals.inserted += result.inserted;
    totals.skipped += result.skipped;
  }

  return totals;
}
