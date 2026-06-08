import { NextRequest, NextResponse } from 'next/server';
import { getReceivedById } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const email = await getReceivedById(id);
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
