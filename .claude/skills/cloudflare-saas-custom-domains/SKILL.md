---
name: cloudflare-saas-custom-domains
description: |
  Set up and implement customer-supplied custom domains for a SaaS via Cloudflare for SaaS
  (Custom Hostnames API) — TLS certificate issuance, domain ownership verification, and
  request routing without customer-managed certs. Covers the Cloudflare dashboard setup
  (Fallback Origin, scoped API token, Zone ID vs Account ID), the Custom Hostnames API
  mechanics (create/status/delete, SSL/verification methods), and common pitfalls (526
  Invalid SSL Certificate and its fix, token over-scoping). This skill should be used when
  a SaaS needs to let customers point their own domain at the platform (white-label portals,
  custom checkout domains, etc.), when debugging a Cloudflare Custom Hostname issue, or when
  deciding between Cloudflare for SaaS and a raw Traefik/nginx dynamic-ACME approach. Holds a
  living per-project implementation checklist at the bottom — update it as tasks complete,
  don't let it drift from the project's actual spec/tasks files.
---

# Cloudflare for SaaS — Custom Domains

General setup + implementation guidance for letting customers point their own domain at your
platform, with Cloudflare handling TLS and ownership verification. Applies to any SaaS behind
Cloudflare, regardless of backend stack.

---

## Before doing anything here

Gather context first:
- **This project's spec/plan/tasks** (if they exist) — don't duplicate their content, this
  skill supplements them with Cloudflare-specific mechanics they reference but don't spell
  out in full.
- **Whether Cloudflare is already the CDN/DNS layer** for the target domain — Cloudflare for
  SaaS requires the platform's own domain to already be on Cloudflare; it's not a way to add
  Cloudflare to a domain that isn't there yet.
- **Cloudflare plan tier** — Custom Hostnames is available on Free/Pro/Business, no
  Enterprise required for the core feature (Enterprise only unlocks extras: custom origin CA,
  wildcard hostnames, mTLS, SNI rewrite).

---

## Why Cloudflare for SaaS over raw dynamic ACME

If the platform's origin is already behind Cloudflare (orange-cloud proxied), a raw
Traefik/nginx ACME HTTP-01 resolver for arbitrary customer domains actively conflicts with
that setup: HTTP-01 requires the challenge request to reach the origin directly, which means
the customer's domain would need to stay un-proxied (grey-cloud) — defeating the point of
having Cloudflare in front. DNS-01 would work but requires the *customer's* DNS provider API
credentials, impractical for arbitrary third-party domains you don't control.

Cloudflare for SaaS sidesteps this entirely: Cloudflare issues and manages the cert at its own
edge, the origin server never needs a cert for the customer's specific domain (only for the
platform's own Fallback Origin/zone). Pricing: 100 custom hostnames free, then
$0.10/hostname/month, self-serve up to 50,000 (verify current pricing before quoting — this
changes; check the live docs page, not a cached figure).

---

## One-time dashboard setup

1. **Enable Cloudflare for SaaS** on the platform's zone (SSL/TLS → Custom Hostnames).
2. **Configure a Fallback Origin** — a hostname on the same zone (e.g. `fallback.yourdomain.com`)
   that Cloudflare routes all custom-hostname traffic to by default; your app then resolves
   which customer/tenant owns which domain via the incoming Host header.
   - DNS record for the fallback hostname must be **proxied (orange-cloud)** — required, a
     grey-clouded record fails.
   - The fallback hostname needs a valid TLS cert at the actual origin server too (see Pitfall
     1 below — this is the most common setup mistake).
3. **Create a scoped API token** (My Profile → API Tokens → Create Custom Token):
   - Permission: `Zone → SSL and Certificates → Edit`
   - Zone Resources: `Include → Specific zone → <your zone>` — **not "All zones"**, which is
     the dashboard's default and over-scopes the token to every zone on the account.
   - Set an expiry (don't leave it perpetual).
4. **Get the Zone ID** from the zone's Overview page (right sidebar) — **not the Account ID**
   shown next to it. The Custom Hostnames API is scoped by `zone_id` in the URL path; using
   the Account ID there silently fails. Zone ID itself is not sensitive (safe to reference in
   code/docs), unlike the API token.

**Verification command** (confirms token + zone ID are correctly wired):
```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/custom_hostnames"
```
`200` + `"success": true` (empty list is fine) → working. `403` → token permission/scope
wrong. `400`/invalid zone → Zone ID vs Account ID mix-up.

---

## API mechanics

Full request/response shapes: `references/cloudflare-api-reference.md`.

**Base URL**: `https://api.cloudflare.com/client/v4/zones/{zone_id}/custom_hostnames`
(zone-scoped, not account-scoped).

**Create**: `POST` with `{ "hostname": "<customer-domain>", "ssl": { "method": "http", "type": "dv" } }`.
`method: http` means Cloudflare checks a token at a well-known path once the customer's CNAME
resolves — no manual TXT record needed for the common case (use `method: txt` instead if you
want to pre-validate ownership before the customer cuts over DNS, to avoid downtime).

**Check status**: `GET /custom_hostnames/{id}`. Both `status` (hostname-level, e.g.
`pending`/`active`) AND `ssl.status` (cert-level, e.g. `pending_validation`/`active`) must
independently reach `active` before the domain is truly ready — check both, not just one.

**Delete**: `DELETE /custom_hostnames/{id}` — do this on customer offboarding/domain removal
so the account doesn't accumulate allocated-but-unused hostnames against the
free-100/paid-tier count.

**Implementation note**: build a thin wrapper module around these three calls rather than
scattering `fetch` calls through the app — keeps the Cloudflare API as the single integration
point if you ever need to swap providers or add retry/backoff logic.

---

## Common pitfalls

### 1. Fallback Origin (or any hostname) shows "Active" in the dashboard but returns HTTP 526

**Symptom**: Cloudflare's status badge is green, but `curl -I https://the-hostname/` returns
`HTTP/2 526`.

**Cause**: `526` is Cloudflare's "Invalid SSL Certificate" error — Cloudflare reached the
origin over HTTPS but rejected the certificate it got back. The dashboard badge only confirms
DNS resolves and the origin is reachable, **not** that the origin has a valid cert for that
specific hostname. Happens whenever a new hostname hasn't been registered with whatever issues
certs at your origin (Traefik, nginx + certbot, a load balancer, etc.).

**Fix**: Add the hostname to your origin's TLS/cert config the same way every other hostname
on that origin is configured, wait for the cert to issue, re-curl.

**Lesson**: Never trust a Cloudflare "Active" badge alone as proof a hostname is fully
working — always verify with a direct `curl -sI` against the actual hostname before moving on.

### 2. API token scoped to "All zones" instead of one specific zone

**Symptom**: nothing breaks immediately — this is a least-privilege issue, easy to miss.

**Cause**: Cloudflare's Create Custom Token screen defaults Zone Resources to "All zones."

**Fix**: Zone Resources → `Include` → `Specific zone` → select the target zone explicitly.
Always double-check this before saving any new Cloudflare API token.

### 3. Zone ID vs Account ID confusion

**Symptom**: API calls fail (`400` or a generic "invalid zone" error) despite a valid token.

**Cause**: The dashboard shows both IDs side by side on the zone Overview page. The Custom
Hostnames API needs `zone_id`, not `account_id` — using the wrong one silently targets the
wrong (or no) resource.

**Fix**: Copy the value explicitly labeled "Zone ID."

---

## Project tracking

This section holds the *current project's* live implementation state — reusable skill, but
project-specific progress. Replace/reset this section if reused on a different project.

**Project**: Octively (`/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas`)
**Feature**: `specs/007-custom-domain-support/` — Agency-plan clients get a branded client
portal domain. Full spec/plan/tasks live there; this tracks only completion state.
**Status as of 2026-07-21**: T001-T013 code-complete, `npm run build` exits 0. All 6 phases done.
Only remaining work is the manual end-to-end pass (real domain → Cloudflare → DNS cutover → login →
cookie inspection) — requires the user, cannot be done by the agent.

### Setup checklist
- [x] Cloudflare for SaaS enabled on `octively.com`
- [x] Fallback Origin `fallback.octively.com` — DNS proxied, added in Dokploy, verified via
  curl (`200`, `x-powered-by: Next.js`) after fixing a 526 (Pitfall 1 above — this project's
  real occurrence of it)
- [x] Scoped API token created (Zone → SSL and Certificates → Edit, `octively.com` only, not
  "All zones" — this project caught and corrected that mistake too)
- [x] Token + Zone ID (`78d6f1d621527deb37e9af349917dc84` — safe to reference, not sensitive)
  added to `.env.local`
- [x] T001 checkpoint curl succeeds — `200`, `success: true`, empty result list (2026-07-21)
- [ ] Production env vars added in Dokploy panel (server-only, not a `NEXT_PUBLIC_*` build-arg)
  — deferred until implementation is further along, not needed for local dev work

### Task checklist (mirrors `specs/007-custom-domain-support/tasks.md` — update immediately
after finishing a task, don't let this drift)

- [x] T001 Cloudflare credentials working end to end
- [x] T002 `organizations` schema migration — hand-written (`0025_custom_domain_support.sql`,
  `db:generate`/`db:migrate` both blocked by the journal drift, see `octively-failure-archaeology`
  G3), applied directly to production Neon via SQL editor (2026-07-21)
- [x] T003 `lib/domains/cloudflare.ts` API client
- [x] T004 `lib/domains/lookup.ts` Redis-first domain→org resolution
- [x] T005 `app/api/v1/org/custom-domain/route.ts` POST/DELETE (GET/T011 built in the same pass)
- [x] T006 Rate limit on the new route — per-org (session.user.id), 5/min
- [x] T007 `proxy.ts` fallback branch — proxy() is now async, header forwarded via
  `NextResponse.rewrite(url, { request: { headers } })` (verified via Context7 against
  Next.js 16.1.6 docs)
- [x] T008 Portal branding resolution from custom-domain header — scoped to org *name* only
  (no logo/color field exists in schema); applied to the portal login page specifically
  (`app/(portal)/portal/login/`, split into server page.tsx + client LoginForm.tsx)
- [x] T009 Dashboard settings panel (add/remove, CNAME display) — combined with T012, see below
- [x] T010 `lib/auth/index.ts` `trustedOrigins` async-function change (⚠️ highest-risk
  checkpoint — manually inspect the session cookie's domain attribute, don't trust "it
  redirected" as proof). Also added `https://fallback.octively.com` to the static origin list.
  **Manual cookie-inspection checkpoint still outstanding — do before considering this done.**
- [x] T011 `GET` status handler — built into `app/api/v1/org/custom-domain/route.ts` alongside
  T005 rather than as a separate pass
- [x] T012 Settings panel status display — `CustomDomainSettings.tsx` maps Cloudflare's raw
  `status`/`ssl.status` to plain language (Live / waiting-for-DNS / not-ready), never shows
  raw Cloudflare strings, check-on-view + manual refresh button, no poller (YAGNI per plan.md)
- [x] T013 `npm run build` exits 0 — code complete. Manual end-to-end pass (real domain
  cutover, cookie inspection) not yet run — requires the user.

### Env vars (this project)

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` — placeholders in `.env.example` (Phase 7
section). Local: `.env.local`. Production: Dokploy panel Environment tab.

---

## When NOT to use this skill

- The overall feature design/rationale for a specific project → that project's own spec doc
- General Cloudflare/CDN/SSL setup unrelated to Custom Hostnames (standard subdomain certs,
  cert renewal for domains you already control) → the project's general deploy/infra skill
- Whether a paid Cloudflare feature needs approval, which change-control gate it falls under
  → the project's own change-control conventions
