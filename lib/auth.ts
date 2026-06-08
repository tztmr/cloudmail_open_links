import crypto from 'node:crypto';

export type UserRole = 'admin' | 'user';

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
};

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = 'sha256';

function getSessionSecret(secret?: string) {
  return secret || process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'cloudmail-session-secret';
}

export function getAuthMode(userCount: number): 'bootstrap' | 'login' {
  return userCount === 0 ? 'bootstrap' : 'login';
}

export function buildScopedFilter<T extends Record<string, unknown>>(user: AuthUser, filter: T): T | (T & { owner_user_id: string }) {
  if (user.role === 'admin') return filter;
  return {
    ...filter,
    owner_user_id: user.id,
  };
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, PASSWORD_KEYLEN, { N: 16384 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  const [salt, expectedHex] = String(hashed || '').split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: 16384 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });

  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function createSessionValue(userId: string, secret?: string): string {
  const payload = userId.trim();
  const signature = crypto.createHmac(PASSWORD_DIGEST, getSessionSecret(secret)).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifySessionValue(value: string, secret?: string): string | null {
  const input = String(value || '');
  const dotIndex = input.indexOf('.');
  if (dotIndex <= 0) return null;

  const payload = input.slice(0, dotIndex);
  const signature = input.slice(dotIndex + 1);
  const expectedValue = createSessionValue(payload, secret);
  const expectedSignature = expectedValue.slice(expectedValue.indexOf('.') + 1);

  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return payload;
}
