# R2 Storage Client Contract (Story 6)

Both clients point at the same bucket (`R2_BUCKET`, e.g. `yl-social`) via the same
`R2_ENDPOINT`, and produce URLs under the same `R2_PUBLIC_URL` convention (FR-016).

## TypeScript — `apps/dashboard/lib/r2.ts`

```ts
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void>;

export function getPublicUrl(key: string): string;
// returns `${process.env.R2_PUBLIC_URL}/${key}`
```

Built on `@aws-sdk/client-s3`'s `S3Client`, configured with:
- `endpoint: process.env.R2_ENDPOINT`
- `region: 'auto'` (R2's convention)
- credentials from `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

## Python — `apps/worker/storage/r2.py`

```python
def upload_buffer(key: str, data: bytes, content_type: str) -> None: ...
def get_public_url(key: str) -> str: ...
    # returns f"{os.environ['R2_PUBLIC_URL']}/{key}"
```

Built on `boto3`'s S3 client (already a Week-1 `requirements.txt` dependency),
configured the same way as the TypeScript client: `endpoint_url` = `R2_ENDPOINT`,
credentials from the same two env vars.

## Contract

- Same key convention both languages: `renders/{uuid}.png` for render output;
  other prefixes (e.g. `assets/`) as later weeks need them.
- `get_public_url`/`getPublicUrl` never re-uploads anything — it's a pure string
  function over the key and `R2_PUBLIC_URL` (spec.md Story 6, Acceptance Scenario 3).
- Neither client swallows an upload failure silently — both propagate the
  underlying S3 SDK error rather than returning a URL for a file that isn't
  actually there.
