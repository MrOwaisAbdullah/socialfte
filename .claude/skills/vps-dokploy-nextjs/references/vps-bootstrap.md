# VPS Bootstrap + Dokploy Install

## Instance selection

**Hetzner CX33** (Intel, 4 vCPU, 8 GB RAM, 80 GB disk) — €6.49/mo post Apr 2026.

- 8 GB required: the ONNX model takes ~150-300 MB at inference; CX23 (4 GB) is too tight.
- Intel over ARM (CAX): Dokploy's Hetzner tutorial explicitly marks arm64 "untested and not
  recommended." The ONNX native binaries and `sharp` are arch-specific; `linux/amd64` matches
  the CX33 and GitHub Actions' `ubuntu-latest`.
- CX33 is now *cheaper* than the equivalent ARM CAX21 (€7.99). Pick CX33.
- OS: **Ubuntu 24.04 LTS** (recommended). Ubuntu 26.04 "resolute" also works but requires
  a manual Docker install step — see P20 in pitfalls.md. SSH hardening uses the same
  drop-in pattern (`/etc/ssh/sshd_config.d/99-hardening.conf`) on both versions.

## 2a — SSH key (on your laptop, before creating the server)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/octively_dokploy -C "octively-dokploy"
cat ~/.ssh/octively_dokploy.pub   # paste this into Hetzner → SSH keys
```

Paste the **public** key at create-server time. Hetzner will not email a root password.

## 2b — First login + system update

```bash
ssh -i ~/.ssh/octively_dokploy root@<vps-ip>
apt update && apt upgrade -y
```

## 2c — Non-root sudo user

```bash
adduser octively
usermod -aG sudo octively
rsync --archive --chown=octively:octively ~/.ssh /home/octively
```

Reconnect as the user: `ssh -i ~/.ssh/octively_dokploy octively@<vps-ip>`

## 2d — Swap (cheap insurance)

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2e — Firewall

> **CRITICAL: Docker bypasses UFW.**
> Dokploy runs in Docker. Docker writes its own iptables rules *below* UFW, so a UFW
> `deny` does **not** block a port a container publishes (including port 3000). Dokploy's
> own security docs call this out explicitly. The fix: use **Hetzner Cloud Firewall**
> (applied at the network edge, before Docker's iptables) as the authoritative gate.
> UFW is defence-in-depth only.

```bash
# UFW — defence-in-depth; Hetzner Cloud FW is the real gate
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp          # TEMPORARY — removed after panel is on a domain
sudo ufw enable
```

**Also set up the Hetzner Cloud Firewall** (panel → Firewalls) to mirror this exactly and
apply it to the server. This is the layer that actually blocks Docker-published ports.

## 2f — Install Dokploy (MUST RUN AS ROOT, not sudo)

```bash
# The script exits with "must run as root" if run via sudo.
# If you are the non-root user, do: sudo su -   (switch to root first)
curl -sSL https://dokploy.com/install.sh | sh
```

Installs Docker + Traefik, binds UI to port 3000. Takes 2–5 min.

Open `http://<vps-ip>:3000` immediately and create the admin account. Do it before anyone
else can reach the box.

## 2g — Put the panel on a domain, then close 3000

1. DNS: point `deploy.yourdomain.com` (A record) at the VPS IP. Set it **grey-cloud (DNS
   only)** in Cloudflare so Let's Encrypt can validate over HTTP (orange-cloud blocks it).
2. Dokploy → Settings → Server: set Host = `deploy.yourdomain.com`, enable HTTPS, save.
   Dokploy issues a Let's Encrypt cert. Panel is now `https://deploy.yourdomain.com`.
3. Close port 3000:
   ```bash
   sudo ufw delete allow 3000/tcp   # defence-in-depth (Docker may ignore this)
   ```
   **Then remove the 3000 rule from the Hetzner Cloud Firewall** — this is what actually
   blocks it. Verify from your laptop that `http://<vps-ip>:3000` no longer responds.
4. Enable 2FA on the admin account (Dokploy ≥ v0.19 → profile).
5. (Optional) Switch the `deploy.` record to orange-cloud once the cert is issued.
