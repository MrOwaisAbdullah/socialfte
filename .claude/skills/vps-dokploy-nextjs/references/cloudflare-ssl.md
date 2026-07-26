# Cloudflare + SSL Configuration

## ⚠️ Critical Cloudflare Settings (always verify these first)

Before deploying or debugging ANY issue, verify these settings:

| Setting | Where | Correct Value | Wrong Values |
|---|---|---|---|
| **SSL/TLS mode** | SSL/TLS → Overview | **Full (Strict)** | Flexible (causes redirect loops), Full (less secure) |
| **Browser Cache TTL** | Caching → Configuration | **Respect Existing Headers** | Any fixed TTL (4 hours, 1 month, etc.) — overrides Next.js headers |
| **Caching Level** | Caching → Configuration | **Standard** | Aggressive (caches too much) |
| **Always Use HTTPS** | SSL/TLS → Edge Certificates | **ON** | OFF (allows unencrypted traffic) |
| **Universal SSL** | SSL/TLS → Edge Certificates | **Active** | Pending/Disabled (causes ERR_CONNECTION_CLOSED) |

### Why these matter

- **Full (Strict)**: Traefik forces HTTPS; Flexible mode creates infinite redirect loops
- **Respect Existing Headers**: Next.js sets proper `Cache-Control` per route; fixed TTL overrides and serves stale content
- **Universal SSL Active**: If pending/disabled, Cloudflare edge TLS handshakes fail intermittently (ERR_CONNECTION_CLOSED)

## SSL mode: Full (Strict) — this is non-negotiable with Traefik

Dokploy uses **Traefik** as the reverse proxy. Traefik automatically redirects HTTP → HTTPS.
Cloudflare's **Flexible** mode sends HTTP from Cloudflare to the origin, which Traefik
immediately redirects back to HTTPS, creating an infinite redirect loop
(`ERR_TOO_MANY_REDIRECTS`).

Many generic "VPS + Cloudflare" tutorials use Flexible successfully — because those tutorials
run plain Nginx, which does not force HTTPS on the origin. With Traefik, **Flexible kills
your app**.

**Fix:** Cloudflare dashboard → SSL/TLS → Overview → set **Full (Strict)**.

## DNS records

| Record | Type | Target | Proxy status after cert issuance |
|---|---|---|---|
| `@` (root domain) | A | VPS IP | Orange (Proxied) |
| `admin` | A | VPS IP | Orange |
| `app` | A | VPS IP | Orange |
| `deploy` | A | VPS IP | Orange (or grey if using Tunnel) |
| MX / DKIM / SPF / DMARC | various | mail provider | **Grey ALWAYS** (never proxy email) |

## The Let's Encrypt HTTP-01 gotcha (why you must grey-cloud first)

Traefik gets its TLS cert from Let's Encrypt via the **HTTP-01 challenge**: ACME makes an
HTTP request to `http://yourdomain.com/.well-known/acme-challenge/<token>`. When a DNS
record is **orange-clouded**, Cloudflare intercepts that request and auto-redirects it to
HTTPS — so the ACME server gets a redirect, not the challenge token, and the validation
**fails**. No cert is issued.

### Fix: grey-cloud during issuance, then orange-cloud

1. Set the DNS record to **DNS only** (grey cloud) in Cloudflare.
2. Add the domain in Dokploy → Domains → let Traefik issue the cert. Wait until Dokploy
   shows the cert as valid (HTTPS green).
3. Switch the record to **Proxied** (orange cloud) in Cloudflare.

Do this per-domain. Order: `deploy.` first (panel cert), then the app domains.

### Durable renewals: Cloudflare Config Rule

Let's Encrypt renews every ~60 days. With the proxy on, future HTTP-01 challenges will hit
the same wall. Add a Cloudflare **Configuration Rule**:

- Matches: `http://yourdomain.com/.well-known/acme-challenge/*` (wildcard)
- Settings: disable "Automatic HTTPS Rewrites", set "Cache" to bypass
- This lets renewal challenges pass through over HTTP without orange-clouding each time.

### Alternative: Cloudflare Origin CA cert (15-year, no ACME)

- Issue a 15-year cert in Cloudflare → SSL/TLS → Origin Server → Create Certificate.
- Install in Dokploy instead of Let's Encrypt.
- Trusted **only by Cloudflare** (not by Node.js/browsers directly).
- Problem: any server-side fetch from Next.js to your own HTTPS domain would fail cert
  validation in Node. Avoid unless you are sure you have no SSR fetches to your own origin.

### Alternative: Cloudflare Tunnel

- Install `cloudflared` on the VPS; create a tunnel.
- No open 80/443 to the internet; Cloudflare edge handles TLS.
- Strongest security posture; adds a `cloudflared` dependency.
- Configure in Dokploy's "Cloudflare" service type instead of standard domains.

## Cache rules (critical for Next.js)

| Rule | Behaviour | Why |
|---|---|---|
| `yourdomain.com/api/*` | **Cache: Bypass** | SSE streaming chat must not be buffered or cached |
| `yourdomain.com/embed.js` | **Cache: Cache Everything** + long TTL | Static widget file; heavy caching is good |
| `yourdomain.com/*` | Default | Next.js cache-control headers drive it |

Without bypassing `/api/*`, Cloudflare caches the first SSE frame and hangs the chat stream.

## ERR_CONNECTION_CLOSED on subdomains (intermittent)

This error appears intermittently in browsers when accessing subdomains like
`admin.octively.com` or `app.octively.com`. The browser shows:
```
ERR_CONNECTION_CLOSED
```

### Root cause

Cloudflare edge TLS handshake timeouts. When Cloudflare's edge servers attempt to
establish a TLS connection with the origin (your VPS via Traefik), the handshake
sometimes times out before completion. This is a Cloudflare-side issue, NOT a server
problem.

### How to diagnose

1. **Check server health directly** (bypassing Cloudflare):
   ```bash
   curl -I -H "Host: admin.octively.com" http://YOUR_VPS_IP
   # Should return 307/308 redirect to HTTPS
   ```

2. **Verify certs are valid on origin**:
   ```bash
   docker exec CONTAINER_NAME openssl s_client -connect localhost:443 -servername admin.octively.com </dev/null 2>/dev/null | openssl x509 -noout -dates
   ```

3. **Check Traefik logs** for TLS handshake errors:
   ```bash
   docker service logs octively-saas-SERVICE_ID --tail 100 | grep -E "connection reset|i/o timeout|handshake"
   ```
   You'll see lines like:
   ```
   msg="Error while Peering forth TCP conn" error="connection reset by peer"
   msg="Error while setting deadline" error="i/o timeout"
   ```

4. **If server is healthy but browser fails** — it's Cloudflare edge, not your VPS.

### Fix

- **Wait 2–5 minutes** — this is typically transient and self-resolves.
- **Purge Cloudflare cache** (Dashboard → Caching → Configuration → Purge Everything).
- **Check Browser Cache TTL** is set to **"Respect Existing Headers"** (Caching → Configuration).
- **Ensure SSL/TLS mode is Full (Strict)** — not Full, not Flexible.
- **Verify Universal SSL is Active** (SSL/TLS → Edge Certificates → Universal SSL status).

### Key point

> If `curl -I http://YOUR_IP` works but the browser fails intermittently, the server is
> healthy. The issue is Cloudflare's edge network, not your VPS, Traefik, or certificates.
> These issues typically resolve within a few minutes without intervention.

## Cloudflare summary checklist

```
SSL/TLS mode   □ Full (Strict) — NOT Flexible, NOT Full
DNS            □ Each record grey-cloud during cert issuance → orange after
Renewals       □ Config Rule for /.well-known/acme-challenge/* → bypass HTTP redirect
Cache          □ Bypass /api/* □ Cache /embed.js
Browser Cache  □ Respect Existing Headers (Caching → Configuration)
Email records  □ MX/DKIM/SPF/DMARC = grey ALWAYS
```
