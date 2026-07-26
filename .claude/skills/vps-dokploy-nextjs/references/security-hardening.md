# Security Hardening (VPS + Dokploy)

Do this BEFORE pointing real DNS at the box. A live Dokploy panel with customer data and no
hardening is a single exploit away from full infra compromise.

## 13.1 SSH — drop-in (not sshd_config directly)

**Ubuntu 24.04 gotcha:** `/etc/ssh/sshd_config.d/50-cloud-init.conf` re-enables
`PasswordAuthentication yes` on every cloud-init run, overriding whatever you put in
`/etc/ssh/sshd_config`. Edit that file or it will just come back. The fix is a higher-priority
drop-in:

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 3
X11Forwarding no
EOF
sudo systemctl restart ssh
```

**Verify in a second terminal BEFORE closing the first.** If SSH breaks and you have no web
console fallback, you may need to use Hetzner's VNC console to recover.

Numbered drop-ins are read in sort order; `99-` wins over `50-cloud-init.conf`.

## 13.2 Firewall — Docker bypasses UFW

> Docker inserts iptables rules that bypass UFW's FORWARD chain. A `ufw deny 3000` does
> NOT block a container that publishes port 3000. This is documented in Dokploy's own
> security docs.

- **Hetzner Cloud Firewall** (panel → Firewalls) is the authoritative gate — it filters at
  the network edge, before Docker's iptables. Set it to allow inbound: **22, 80, 443 only**.
  3000 only during initial setup, then remove it.
- Keep UFW (`default deny incoming`) as defence-in-depth.
- Optional: install **`ufw-docker`** to make UFW's rules apply to Docker-published ports too.

```bash
# Only after Dokploy is installed and 3000 is on a domain
sudo ufw delete allow 3000/tcp
# Then remove 3000 in Hetzner Cloud Firewall panel (this is what actually closes it)
```

## 13.3 Brute-force + auto-patching

```bash
sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

With SSH key-only auth (§13.1), fail2ban kills SSH scan noise. `unattended-upgrades` keeps
the OS kernel and system packages patched automatically.

## 13.4 Dokploy panel hardening

- **2FA on the admin account.** Dokploy ≥ v0.19 supports TOTP. The panel can deploy and
  destroy everything — treat it like root access.
- Panel accessible only via `https://deploy.yourdomain.com` (never raw IP:3000 — §2g).
- **Scoped API token** for CI: Dokploy → API keys → create a per-org key with the minimum
  permissions needed for deploy, set an **expiry (~90 days)**, store only as the
  `DOKPLOY_API_KEY` GitHub secret. A leaked full-access token = full infra compromise.
- Keep Dokploy updated (panel → Updates). Releases carry security fixes.
- Optional but strong: put the panel behind a **Cloudflare Access policy** (Zero Trust)
  so it is not publicly reachable at all — only authenticated users can reach it.

## 13.5 Container + app layer

- **Run as non-root.** Our Dockerfile already uses `USER node`. Never remove this.
- **Set resource limits** in Dokploy (CPU/RAM caps). The ONNX model peaks at 150-300 MB;
  set a memory limit so a runaway inference doesn't OOM the whole box.
- **Secrets in Dokploy env only.** The `.dockerignore` excludes `.env*`. Only `NEXT_PUBLIC_*`
  go into the image as build-args (they're public by definition). Server secrets
  (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) never touch the image.
- **Rotate `BETTER_AUTH_SECRET` carefully** — rotating it invalidates all active sessions.
  Plan a maintenance window.
- **HTTPS everywhere** — Full (Strict) mode + Cloudflare edge (§cloudflare-ssl.md).
- **App-layer protections still apply:** Zod validation on all routes, Upstash rate limits
  on public embed endpoints, tenant isolation (`org_id`/`bot_id`) on every query, HMAC
  webhook signing. These don't change on the VPS.

## 13.6 Data safety + backups

| Data | Where | Backup story |
|---|---|---|
| App DB (orgs, bots, leads, convos, chunks) | Neon (managed, EU) | Neon point-in-time restore / branching — verify PITR window |
| Credits / rate-limits / sessions | Upstash Redis (managed, EU) | Rebuildable; Upstash has persistence |
| Uploaded documents | Cloudflare R2 | Durable; enable versioning |
| ONNX model cache | VPS volume | Disposable — re-downloads ~110 MB if lost |
| Dokploy config/state | VPS local | **Must back up** — losing it means rebuilding the panel config by hand |

Container is **stateless** — app data is in managed offsite services. A dead VPS loses zero
customer data. This is the point.

**Back up Dokploy config** (Dokploy → Backups → configure to R2/S3). Dokploy dumps plain
SQL — **encrypt the dump** with age or GPG (private key stored off-server) before upload.
A leaked storage bucket shouldn't expose your entire configuration.

**Enable Hetzner backups** (+20%/mo) or weekly snapshots for whole-box restore.

**Test a restore once.** An untested backup is a guess. Spin a throwaway CX11, restore,
confirm Dokploy boots correctly.

## Quick hardening checklist

```
Server   □ SSH key auth only  □ root login disabled  □ password auth off  □ fail2ban running  □ auto-updates enabled
Firewall □ Hetzner Cloud FW is source of truth  □ only 22/80/443 open  □ 3000 closed  □ UFW deny-incoming
Panel    □ HTTPS-only via deploy. subdomain  □ 2FA enabled  □ scoped + expiring API token  □ Dokploy updated
App      □ non-root container (USER node)  □ resource limits set  □ secrets in env only  □ Full(Strict) TLS
Data     □ Neon PITR window verified  □ Dokploy config backed up (encrypted) to R2  □ restore tested
```
