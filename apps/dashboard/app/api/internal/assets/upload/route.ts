import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.RENDER_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing file field' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() ?? 'png';
  const key = `assets/${randomUUID()}.${ext}`;
  await uploadBuffer(key, buffer, file.type || `image/${ext}`);

  const imageUrl = getPublicUrl(key);
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`
    INSERT INTO assets (r2_key, times_used)
    VALUES (${key}, 0)
    RETURNING id
  `;

  const assetId = row.id;

  try {
    const workerUrl = process.env.WORKER_INTERNAL_URL;
    if (workerUrl) {
      const tagRes = await fetch(`${workerUrl}/vision/tag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.RENDER_INTERNAL_SECRET ?? '',
        },
        body: JSON.stringify({ asset_id: assetId, image_url: imageUrl }),
      });

      if (!tagRes.ok) {
        const errBody = await tagRes.text();
        console.error('Vision tagging failed for asset', assetId, tagRes.status, errBody);
      }
    }
  } catch (err) {
    console.error('Vision tagging call failed for asset', assetId, err);
  }

  return NextResponse.json({ id: assetId, url: imageUrl });
}
