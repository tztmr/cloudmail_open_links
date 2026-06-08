import { NextRequest, NextResponse } from 'next/server';
import { createPasswordHash } from '@/lib/auth';
import { requireAdmin } from '@/lib/admin';
import { createUser, getUserByUsername, listUsers } from '@/lib/db';

type CreateUserBody = {
  username?: string;
  password?: string;
  role?: 'admin' | 'user';
};

function normalizeUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await listUsers();
  return NextResponse.json({ success: true, users });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as CreateUserBody;
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'user';

  if (!username || !password) {
    return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 });
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }

  const user = await createUser({
    username,
    password_hash: await createPasswordHash(password),
    role,
  });

  return NextResponse.json({ success: true, user });
}
