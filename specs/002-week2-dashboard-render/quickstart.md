# Quickstart: Validating Week 2 (Schema, Dashboard, Render Pipeline)

Run this after `/sp.implement` reports the feature done, to confirm it
independently. Each block maps to one user story's acceptance scenarios in
`spec.md`.

## 1. Schema (Story 1)

```bash
cat apps/worker/db/schema.sql   # confirm all 6 tables, the vector + pgcrypto extensions,
                                 # and the 4 required indexes are present
```
Confirm this was shown to you and explicitly approved *before* it was ever run
against the real Neon `DATABASE_URL`.

## 2. Python models (Story 2)

```bash
python3 -c "from apps.worker.db.models import Asset, Template, Post, Metric, AuditLog, Credential; print('OK')"
```
Compare `models.py`'s columns against `schema.sql` table by table — no column
present in one and not the other.

## 3. Dashboard shell (Story 3)

```bash
cd apps/dashboard && npm run build
```
Load the app and confirm the layout reads as Yousuf Living (forest green primary,
gold accent, Instrument Serif headings) — not a default Next.js starter look.
Confirm there's no third-party auth package in `package.json` and that a session
cookie (not a login form/user table) gates access.

## 4. Templates (Story 4)

Render each of the six templates (via the render-preview route, once Story 5
exists) with representative dummy props at `square`, `feed`, and `reel` — confirm
each is legible at all three, and that changing the `brand` object's values
changes every visible color/font with nothing left over.

## 5. Render round-trip (Story 5)

```bash
curl -X POST "$APP_URL/api/internal/render" \
  -H "Content-Type: application/json" \
  -H "X-Render-Secret: $RENDER_INTERNAL_SECRET" \
  -d '{"templateId":"hero","props":{"imageUrl":"https://example.com/room.jpg","headline":"Ye kitne ka hoga?","highlightWord":"kitne","price":"From Rs 190,000"},"aspect":"reel","brand":{...}}'
```
Confirm the response is `{"url": "..."}`, and that opening that URL in a browser
shows a correctly rendered hero template at 1080×1920 with no visible
navigation/chrome. Also confirm a request with the wrong `X-Render-Secret` is
rejected before anything renders.

## 6. Storage (Story 6)

```bash
python3 -c "
from apps.worker.storage.r2 import upload_buffer, get_public_url
upload_buffer('test/quickstart.txt', b'hello', 'text/plain')
print(get_public_url('test/quickstart.txt'))
"
```
Open the printed URL and confirm it serves back `hello`. Repeat the equivalent
check from the TypeScript client and confirm both URLs follow the same shape.

## 7. Container (Story 7)

```bash
docker build -f infra/Dockerfile.dashboard -t socialfte-dashboard .
docker run --rm -p 3000:3000 --env-file .env socialfte-dashboard
```
Repeat the Section 5 render request against the running container and confirm it
still works — proving the apt-installed Chromium is actually being used, not a
missing/mismatched binary.

## 8. Deployment handoff (Story 8)

```bash
cat infra/docker-compose.yml    # confirm it only adds yl-dashboard
cat specs/002-week2-dashboard-render/contracts/env-vars.md   # the complete list, no secrets filled in
```

## 9. Checkpoint + commit (Story 9)

```bash
git log --oneline -3   # exactly one new commit for this week's work
git status --short     # clean
```
