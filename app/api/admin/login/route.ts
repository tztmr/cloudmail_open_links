import { NextRequest, NextResponse } from 'next/server';
import { getAdminPassword } from '@/lib/admin';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const expected = getAdminPassword();

  if (!expected) {
    return NextResponse.json({ success: true, message: 'No admin password configured' });
  }
  if (password !== expected) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set('cm_admin', expected, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('cm_admin', '', { path: '/', maxAge: 0 });
  return res;
}
