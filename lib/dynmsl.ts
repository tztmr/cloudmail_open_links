// Dynmsl / cloudmail upstream client
// Compatible with the API used in dx888_cloudmail (addUser + public endpoints)
// Now supports multiple providers (different domain + token)

let cachedConfig: { baseUrl: string; headers: Headers } | null = null;
let cachedKey = '';

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

export type ProviderCreds = {
  domain: string;   // e.g. https://mail.dynmsl.com
  token: string;
  wafBypass?: string | null;
};

function getConfig(creds?: ProviderCreds) {
  const baseUrl = normalizeBaseUrl(
    creds?.domain ||
    process.env.DYNMSL_API_BASE_URL ||
    'https://mail.dynmsl.com/api/public'
  );
  const apiToken = creds?.token || process.env.DYNMSL_API_TOKEN;
  const wafBypass = creds?.wafBypass || process.env.DYNMSL_WAF_BYPASS_TOKEN;

  if (!apiToken) {
    throw new Error('No API token provided (neither in creds nor DYNMSL_API_TOKEN env)');
  }

  const key = `${baseUrl}::${apiToken}::${wafBypass || ''}`;
  if (cachedConfig && cachedKey === key) return cachedConfig;

  const headers = new Headers();
  headers.set('Authorization', apiToken);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json, text/plain, */*');
  headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  if (wafBypass) headers.set('X-DYNMSL-WAF-BYPASS', wafBypass);

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

export function isDynmslEmail(email: string): boolean {
  return /@dynmsl\.com$/i.test(email.trim());
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

export function generateDynmslAccount(
  prefix = '',
  length = 8,
  type: 'number' | 'english' | 'mixed' = 'mixed',
  emailDomain?: string | null
) {
  const random = generateRandomString(length, type);
  const domain = (emailDomain && emailDomain.trim()) ? emailDomain.trim() : 'dynmsl.com';
  const email = `${prefix}${random}@${domain}`.toLowerCase().replace(/@+/, '@'); // safety
  const password = generateRandomString(10, 'mixed');
  return { email, password };
}
