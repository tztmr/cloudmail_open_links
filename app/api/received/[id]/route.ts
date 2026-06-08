import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin';
import { getReceivedById, getShareLinkByToken } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const token = new URL(req.url).searchParams.get('token');
  let ownerUserId: string | undefined;

  if (token) {
    const link = await getShareLinkByToken(token);
    if (!link) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    ownerUserId = link.owner_user_id;
  } else {
    try {
      const viewer = await requireUser();
      ownerUserId = viewer.role === 'admin' ? undefined : viewer.id;
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const email = await getReceivedById(id, ownerUserId);
  if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // basic sanitize hint for client, but return raw bodies
  return NextResponse.json({
    success: true,
    email: {
      ...email,
      // do not leak huge raw unless asked; client can request with ?raw=1 if needed
    },
  });
}
