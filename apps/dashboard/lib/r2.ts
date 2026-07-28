// R2 storage client — Week 2, Story 6. See
// specs/002-week2-dashboard-render/contracts/r2-client.md.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto', // R2's convention
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export function getPublicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// Used by DELETE /api/assets/[id] — a no-op if the object is already gone
// (e.g. someone deleted it directly from the R2 dashboard before the app
// ever knew), since the goal is just "make sure it's not there", not
// "prove it was there first".
export async function deleteObject(key: string): Promise<void> {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
  } catch (e) {
    console.error(`Failed to delete R2 object ${key}:`, e);
  }
}
