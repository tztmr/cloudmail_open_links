import { cookies } from 'next/headers';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export async function isAdminAuthenticated(): Promise<boolean> {
  if (!ADMIN_PASSWORD) return true; // no password set = open in dev / trusted env
  const cookieStore = await cookies();
  const val = cookieStore.get('cm_admin')?.value;
  // simple check: cookie value equals the password (httpOnly set on login)
  return val === ADMIN_PASSWORD;
}

export async function requireAdmin() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    throw new Error('Unauthorized');
  }
}

export function getAdminPassword() {
  return ADMIN_PASSWORD;
}
