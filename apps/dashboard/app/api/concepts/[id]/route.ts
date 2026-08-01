import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { concepts } from '@/lib/db/schema';

// PATCH /api/concepts/[id] - Approve or reject a concept
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { state } = body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  await db
    .update(concepts)
    .set({
      state,
      updatedAt: new Date(),
      ...(state === 'approved' && { approvedAt: new Date() }),
    })
    .where(eq(concepts.id, id));

  return NextResponse.json({ success: true });
}
