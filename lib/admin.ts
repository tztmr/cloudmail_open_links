import { cookies } from 'next/headers';
import { createSessionValue, getAuthMode, type AuthUser, verifySessionValue } from '@/lib/auth';
import { countUsers, getUserById } from '@/lib/db';

export const SESSION_COOKIE_NAME = 'cm_session';

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return null;

  const userId = verifySessionValue(value);
  if (!userId) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return user;
}

export function createSessionCookie(userId: string) {
  return createSessionValue(userId);
}

export async function getAuthStatus() {
  const userCount = await countUsers();
  const currentUser = await getCurrentUser();
  return {
    mode: getAuthMode(userCount),
    allowBootstrap: userCount === 0,
    currentUser,
  };
}
