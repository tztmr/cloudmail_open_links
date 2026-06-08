import { NextRequest, NextResponse } from 'next/server';
import { createPasswordHash, verifyPassword } from '@/lib/auth';
import { createSessionCookie, getAuthStatus, getCurrentUser, SESSION_COOKIE_NAME } from '@/lib/admin';
import { countUsers, createUser, getUserByUsername } from '@/lib/db';

type LoginBody = {
  action?: 'bootstrap' | 'login';
  username?: string;
  password?: string;
};

function normalizeUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function buildSessionResponse(payload: Record<string, unknown>, userId: string) {
  const res = NextResponse.json(payload);
  res.cookies.set(SESSION_COOKIE_NAME, createSessionCookie(userId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function GET() {
  const { mode, allowBootstrap, currentUser } = await getAuthStatus();
  return NextResponse.json({
    success: true,
    mode,
    allowBootstrap,
    currentUser,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as LoginBody;
  const action = body.action || 'login';
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');

  if (!username || !password) {
    return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 });
  }

  if (action === 'bootstrap') {
    const totalUsers = await countUsers();
    if (totalUsers > 0) {
      return NextResponse.json({ error: '初始化已完成，请直接登录' }, { status: 403 });
    }

    const user = await createUser({
      username,
      password_hash: await createPasswordHash(password),
      role: 'admin',
    });

    return buildSessionResponse({
      success: true,
      mode: 'login',
      currentUser: user,
    }, user.id);
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  return buildSessionResponse({
    success: true,
    currentUser: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  }, user.id);
}

export async function DELETE() {
  const currentUser = await getCurrentUser();
  const res = NextResponse.json({ success: true, currentUser });
  res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
