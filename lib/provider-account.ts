// Generic upstream mailbox account client.
// Compatible with addUser-style providers that expose public mail APIs.

let cachedConfig: { baseUrl: string; headers: Headers } | null = null;
let cachedKey = '';

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^mail\./i, '').replace(/\.$/, '').toLowerCase();
}

export function inferEmailDomainFromProviderUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = normalizeHostname(parsed.hostname);
    return hostname || null;
  } catch {
    return null;
  }
}

export type ProviderCreds = {
  domain: string;
  token: string;
  wafBypass?: string | null;
  wafBypassHeader?: string | null;
};

function getConfig(creds?: ProviderCreds) {
  const baseUrl = normalizeBaseUrl(
    creds?.domain ||
    process.env.MAIL_PROVIDER_API_BASE_URL ||
    'https://mail.example.com/api/public'
  );
  const apiToken = creds?.token || process.env.MAIL_PROVIDER_API_TOKEN;
  const wafBypass = creds?.wafBypass || process.env.MAIL_PROVIDER_WAF_BYPASS_TOKEN;
  const wafBypassHeader =
    creds?.wafBypassHeader ||
    process.env.MAIL_PROVIDER_WAF_BYPASS_HEADER ||
    'X-WAF-BYPASS';

  if (!apiToken) {
    throw new Error('No API token provided (neither in creds nor MAIL_PROVIDER_API_TOKEN env)');
  }

  const key = `${baseUrl}::${apiToken}::${wafBypassHeader}::${wafBypass || ''}`;
  if (cachedConfig && cachedKey === key) return cachedConfig;

  const headers = new Headers();
  headers.set('Authorization', apiToken);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json, text/plain, */*');
  headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  if (wafBypass) headers.set(wafBypassHeader, wafBypass);

  cachedConfig = { baseUrl, headers };
  cachedKey = key;
  return cachedConfig;
}

async function postJson<T>(path: string, body: unknown, timeoutMs = 20000, creds?: ProviderCreds): Promise<T> {
  const { baseUrl, headers } = getConfig(creds);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(path.replace(/^\//, ''), `${baseUrl}/`);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!res.ok) {
      const msg =
        typeof json?.message === 'string'
          ? json.message
          : text || `Upstream error ${res.status}`;
      throw new Error(msg);
    }
    return (json || {}) as T;
  } finally {
    clearTimeout(t);
  }
}

export interface AddUserItem {
  email: string;
  password: string;
}

export interface AddUsersResponse {
  code?: number | string;
  message?: string;
  success?: boolean;
  data?: unknown;
  [k: string]: unknown;
}

export async function addUsers(list: AddUserItem[], creds?: ProviderCreds): Promise<AddUsersResponse> {
  return postJson<AddUsersResponse>('/addUser', { list }, 20000, creds);
}

// Simple random generator (ported logic from original project, avoiding ambiguous chars)
export function generateRandomString(length: number, type: 'number' | 'english' | 'mixed' = 'mixed'): string {
  const numbers = '2345689';
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const mixed = letters + numbers;

  let chars = mixed;
  if (type === 'number') chars = numbers;
  else if (type === 'english') chars = letters;

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateMailboxAccount(
  prefix = '',
  length = 8,
  type: 'number' | 'english' | 'mixed' = 'mixed',
  emailDomain?: string | null,
  providerUrl?: string | null
) {
  const random = generateRandomString(length, type);
  const domain =
    (emailDomain && emailDomain.trim()) ||
    inferEmailDomainFromProviderUrl(providerUrl) ||
    'mail.example.com';
  const email = `${prefix}${random}@${domain}`.toLowerCase().replace(/@+/, '@');
  const password = generateRandomString(10, 'mixed');
  return { email, password };
}
