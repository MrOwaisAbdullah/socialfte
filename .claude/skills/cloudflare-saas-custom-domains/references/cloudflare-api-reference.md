# Cloudflare Custom Hostnames API — Reference

Full request/response shapes for the three operations SKILL.md summarizes. Verify against
Cloudflare's live docs (`developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas`)
before relying on exact field names for a new integration — this API does evolve.

## Authentication

Every request: `Authorization: Bearer <CLOUDFLARE_API_TOKEN>` header. No other auth method
for this API surface (no API key + email fallback for Custom Hostnames specifically).

## Create a Custom Hostname

```
POST https://api.cloudflare.com/client/v4/zones/{zone_id}/custom_hostnames
Content-Type: application/json

{
  "hostname": "portal.customer-domain.com",
  "ssl": {
    "method": "http",
    "type": "dv",
    "settings": {
      "min_tls_version": "1.2"
    }
  }
}
```

`ssl.method` options:
- `"http"` — Cloudflare places a verification file at a well-known path on the customer's
  domain once their CNAME resolves to your SaaS zone. No action needed from the customer
  beyond the CNAME itself. This is the default for most SaaS custom-domain flows.
- `"txt"` — customer adds a TXT record before DNS cutover. Useful for pre-validating
  ownership so the domain is ready to go live the moment they flip DNS, avoiding a visible
  "not yet verified" window. More setup friction for the customer.
- `"cname"` — customer adds a specific CNAME for validation, separate from their main
  traffic CNAME. Rarely used for the simple "point your domain at us" case.

Response (`201` on success):
```json
{
  "result": {
    "id": "0d89c70d-ad9f-4843-b99f-6cc0458fd6b8",
    "hostname": "portal.customer-domain.com",
    "ssl": {
      "id": "...",
      "status": "pending_validation",
      "method": "http",
      "type": "dv"
    },
    "status": "pending",
    "verification_errors": null,
    "ownership_verification": {
      "type": "http",
      "name": "http-request",
      "value": "..."
    },
    "created_at": "2026-07-21T10:00:00Z"
  },
  "success": true,
  "errors": [],
  "messages": []
}
```

Store `result.id` as the record's `cloudflareHostnameId` — every subsequent status/delete
call needs it, and it cannot be re-derived from the hostname string alone without a search
call.

## Check status

```
GET https://api.cloudflare.com/client/v4/zones/{zone_id}/custom_hostnames/{hostname_id}
```

Response shape matches the `result` object above. Two independent state machines to watch:

**`status`** (hostname-level — is the CNAME pointed correctly and does Cloudflare recognize
this as a valid custom hostname for the zone):
- `pending` — just created, not yet resolved
- `pending_deployment` — resolving, Cloudflare's edge config is propagating
- `active` — fully live
- `pending_deletion` / `deleted` — being removed
- `test_pending` / `test_active` / `test_deleted` — used for a testing sub-flow (rare in the
  standard "customer adds CNAME" flow, more relevant to Enterprise custom origin CA setups)

**`ssl.status`** (certificate-level — has a cert actually been issued):
- `initializing`
- `pending_validation` — waiting on the ownership check (HTTP token / TXT / CNAME depending
  on `ssl.method`)
- `pending_issuance` — validated, cert being issued
- `pending_deployment` — cert issued, deploying to edge
- `active` — cert live and serving
- `pending_deletion` / `deleted`

**Both must be `active`** before treating the domain as fully ready. A hostname can show
`status: active` while `ssl.status` is still `pending_issuance` — traffic to that hostname at
that point would fail with a cert error (visitor-facing, not the 526 origin-side error covered
in SKILL.md's Pitfall 1 — a different failure mode, same underlying "certs are asynchronous"
lesson).

If verification fails or times out, `verification_errors` populates with a human-readable
reason (e.g. `"CNAME record not found"`) — surface this directly in any status UI rather than
just showing a generic "not ready" state; it saves the customer (or your support team) a
DNS-diagnosis round trip.

## Delete

```
DELETE https://api.cloudflare.com/client/v4/zones/{zone_id}/custom_hostnames/{hostname_id}
```

Response: `{ "result": { "id": "..." }, "success": true, ... }`. Idempotent in practice —
deleting an already-deleted or nonexistent id typically returns a `404`/error rather than a
silent success, so callers should treat "not found" on delete as an acceptable outcome (the
end state — hostname gone — is already achieved), not a hard failure to retry indefinitely.

## Rate limits

Cloudflare's general API rate limit (1200 requests / 5 minutes per token as of general API
docs, not Custom-Hostnames-specific) applies. For a SaaS with normal add/remove volume this is
rarely the binding constraint — the more common self-inflicted limit is calling the status
endpoint too aggressively from a client-side poller. Prefer check-on-view (call status when a
user loads the relevant settings page) over a tight polling interval, unless the product
genuinely needs near-real-time status updates.

## Common error responses

| HTTP status | Likely cause |
|---|---|
| `400` | Malformed hostname, or Zone ID/Account ID mix-up in the URL path |
| `403` | Token lacks the `Zone → SSL and Certificates → Edit` permission, or is scoped to the wrong zone |
| `409` | Hostname already exists as a Custom Hostname on this zone (or another zone under Cloudflare for SaaS in some account configurations) |
| `1406` (Cloudflare-specific error code, in the `errors` array body even on a `200`/`400` wrapper) | Hostname fails basic validation (e.g. it's the zone's own apex domain, or a reserved/internal pattern) |

Always check both the HTTP status AND the `errors` array in the response body — Cloudflare's
API sometimes returns `200` with `success: false` and a populated `errors` array rather than
a non-2xx status, depending on the specific failure.
