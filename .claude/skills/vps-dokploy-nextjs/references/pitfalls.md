# Pitfalls — VPS + Dokploy + Next.js

All of these were hit in practice. Each entry has: symptom → root cause → fix.

---

## P1 — Standalone server doesn't start (`Cannot find module`)

**Symptom:** Container starts but `node server.js` crashes with module not found.

**Root cause:** `output: 'standalone'` was not set, OR the three runner COPY lines are
missing, OR `DOCKER_BUILD` was not set during `next build`.

**Fix:**
```ts
// next.config.ts — conditional standalone
output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
```
```dockerfile
# Dockerfile builder stage
ENV DOCKER_BUILD=1   # before `npm run build`

# runner stage — all three are required
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
CMD ["node", "server.js"]
```

---

## P2 — Port 3000 open despite UFW deny

**Symptom:** `curl http://<vps-ip>:3000` succeeds even after `ufw deny 3000`.

**Root cause:** Docker writes its own iptables rules below UFW's FORWARD chain. `ufw deny`
does not affect Docker-published ports. Dokploy's own security docs document this.

**Fix:** Use **Hetzner Cloud Firewall** (network edge, before Docker) as the real gate.
Remove port 3000 from the Hetzner Cloud Firewall inbound rules after the panel is on a domain.
UFW is defence-in-depth only.

---

## P3 — Let's Encrypt cert fails to issue (ACME validation fails)

**Symptom:** Dokploy shows cert issuance error; HTTPS doesn't work.

**Root cause:** The DNS record is **orange-clouded** (Proxied) in Cloudflare. Cloudflare
intercepts the HTTP-01 challenge request and redirects it to HTTPS, so ACME never gets the
challenge token.

**Fix:** Set the DNS record to **grey-cloud (DNS only)** before adding the domain in
Dokploy. After the cert is issued and HTTPS is confirmed, switch to **Proxied (orange)**.
Add a Cloudflare Config Rule on `/.well-known/acme-challenge/*` to bypass HTTP rewrites for
durable renewals.

---

## P4 — ERR_TOO_MANY_REDIRECTS (infinite redirect loop)

**Symptom:** Browser shows too many redirects. The app never loads.

**Root cause:** Cloudflare SSL mode is set to **Flexible**. Traefik redirects HTTP→HTTPS.
Cloudflare sends HTTP to the origin. Traefik redirects again. Loop.

**Fix:** Cloudflare → SSL/TLS → Overview → set **Full (Strict)**. Never use Flexible with
Traefik/Dokploy.

---

## P5 — ONNX `Cannot find module 'onnxruntime-node'` at runtime

**Symptom:** App boots but crashes when embeddings are first called with a native module error.

**Root cause:** Next.js standalone tracing does not reliably follow `.node` binary imports.
The native modules exist in the builder stage but not in the runner.

**Fix (two parts):**
```ts
// next.config.ts — keep out of the bundler
serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
```
```dockerfile
# runner stage — explicit copy
COPY --from=builder /app/node_modules/@huggingface    ./node_modules/@huggingface
COPY --from=builder /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=builder /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
```

---

## P6 — EBADENGINE: ONNX install fails (Node version too old)

**Symptom:** `npm install @huggingface/transformers` shows EBADENGINE warning; container
runs but ONNX pipeline crashes at runtime.

**Root cause:** Transformers.js v4 requires `node ^22.22.2 || ^24.15.0 || >=26`. Node 20
is incompatible. EBADENGINE is a warning (not an error), so it's easy to miss.

**Fix:**
```dockerfile
ARG NODE_VERSION=22-slim   # was 20-slim
```

---

## P7 — `NEXT_PUBLIC_*` is `undefined` in the browser

**Symptom:** Client-side code reads `undefined` for env vars, even though they're set in
Dokploy's environment panel.

**Root cause:** `NEXT_PUBLIC_*` vars are inlined into the client bundle **at build time**,
not read at runtime. Setting them in Dokploy (runtime env) has no effect.

**Fix:** Pass them as Docker build-args in the CI workflow. They must be present during
`next build`.
```dockerfile
# builder stage
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build
```
```yaml
# CI
build-args: |
  NEXT_PUBLIC_APP_URL=${{ secrets.NEXT_PUBLIC_APP_URL }}
```

---

## P8 — `npm ci` fails with workspace resolution error

**Symptom:** Docker build fails at `npm ci` with missing workspace package error.

**Root cause:** The root `package.json` declares workspaces (e.g. `embed`), but only the
root manifest was copied to the Docker build context. `npm ci` can't resolve the workspace.

**Fix:**
```dockerfile
# deps stage
COPY package.json package-lock.json ./
COPY embed/package.json ./embed/package.json   # one line per workspace
RUN npm ci --no-audit --no-fund
```

---

## P9 — SSH locked out after hardening (Ubuntu 24.04)

**Symptom:** After editing `/etc/ssh/sshd_config` to disable password auth and root login,
a subsequent cloud-init run or reboot re-enables them.

**Root cause:** Ubuntu 24.04 ships `/etc/ssh/sshd_config.d/50-cloud-init.conf` with
`PasswordAuthentication yes`. It is included by `sshd_config` via `Include /etc/ssh/sshd_config.d/*.conf`
and is ordered before custom rules if you write to the base file.

**Fix:** Write a drop-in with a higher sort number so it wins:
```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 3
EOF
sudo systemctl restart ssh
```
Always verify with a second open terminal before logging out.

---

## P10 — Dokploy install script refuses to run

**Symptom:** `curl -sSL https://dokploy.com/install.sh | sh` exits with "must run as root".

**Root cause:** The installer checks `id -u` and aborts if not UID 0. Running via `sudo sh`
is not sufficient — the script still detects non-root in some distributions.

**Fix:** Run as actual root:
```bash
sudo su -   # switch to root user first
curl -sSL https://dokploy.com/install.sh | sh
exit        # return to non-root user
```

---

## P11 — Container server binds to localhost (not reachable by Traefik)

**Symptom:** App starts but Traefik gets connection refused; health checks fail.

**Root cause:** `node server.js` defaults to listening on `127.0.0.1` (localhost inside the
container). Traefik reaches the container via the Docker network, not loopback.

**Fix:**
```dockerfile
ENV HOSTNAME=0.0.0.0
```
Or pass `--hostname 0.0.0.0` to the node command. The `HOSTNAME` env var is read by Next.js
standalone's `server.js`.

---

## P12 — Model re-downloads on every container restart (slow first request)

**Symptom:** After a deploy or container restart, the first embedding call is very slow
(downloads ~110 MB) or times out.

**Root cause:** `TRANSFORMERS_CACHE` points to a directory inside the container that is
not mounted to a persistent volume. The container is ephemeral; the cache is lost.

**Fix:** Mount a Docker volume at the cache path in Dokploy:
- App → Mounts → Add → Container path: `/app/.cache/transformers`
- Volume name: e.g. `octively-model-cache`
On first start after the volume is attached, the model downloads once and persists.

---

## P13 — Image fails to run on VPS (wrong architecture)

**Symptom:** Container fails to start with "exec format error" or similar.

**Root cause:** The image was built for `linux/arm64` (default on Apple Silicon dev
machines) but the VPS is Intel (`linux/amd64`).

**Fix:**
```yaml
# CI workflow
platforms: linux/amd64   # must match the Hetzner CX33 (Intel)
```
The native ONNX and sharp binaries are also arch-specific — an arm64 build has arm64
`.node` files that won't load on an x86_64 kernel.

---

## P14 — stale embed widget in production

**Symptom:** Changes to the chat widget don't appear in production even after a deploy.

**Root cause:** The live route serves `embed/dist/embed.min.js` (the compiled file), not
`embed/src/embed.js`. The Dockerfile runs `build:embed` to compile it, but if the script
wasn't run before `next build`, the old minified file is what gets served.

**Fix:** Always run in this order:
```dockerfile
RUN npm run build:embed && npm run build
```
Also commit `embed/dist/embed.min.js` alongside any `embed/src/embed.js` changes.

---

## P15 — GHCR push fails: "repository name must be lowercase"

**Symptom:** CI fails instantly with `invalid tag "ghcr.io/YourName/app:latest": repository name must be lowercase`.

**Root cause:** `${{ github.repository_owner }}` preserves the original GitHub username casing (e.g. `MrOwaisAbdullah`). GHCR (and Docker registries generally) require all-lowercase image names.

**Fix:** Hardcode the image name with a lowercase username instead of using the `github.repository_owner` expression:
```yaml
env:
  IMAGE: ghcr.io/yourusername/your-app   # lowercase, not ${{ github.repository_owner }}
```

---

## P16 — `npm ci` fails: "Missing: @package@x.y.z from lock file" (cross-platform optional deps)

**Symptom:** Docker build fails at `npm ci` with "Missing: X@Y.Z.W from lock file" even though the package IS visually present in `package-lock.json`.

**Root cause:** A cpu-specific optional package (e.g. `@rolldown/binding-wasm32-wasi`, cpu: wasm32) is in the lock file and pins a dep to an exact version. Because the package is cpu=wasm32, `npm install` on linux-x64 never downloads it and never writes its nested dep entry to the lock file. `npm ci` in the linux/amd64 container then can't find that exact version.

Upgrading npm alone doesn't help — the lock file is genuinely incomplete for cross-platform optional entries.

**Fix:** Use `npm install` instead of `npm ci` in the deps stage:
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
RUN npm install -g npm@11 --quiet
COPY package.json package-lock.json* ./
COPY embed/package.json ./embed/package.json
# npm install (not npm ci) — cross-platform optional packages pin exact dep versions
# that are never written to the lock file on linux-x64, causing npm ci to fail.
RUN npm install --no-audit --no-fund
```

Docker layer caching keeps this fast — the install only re-runs when package.json or package-lock.json change.

---

## P17 — `next build` fails: SDK throws "Missing API key" during page data collection

**Symptom:** Build succeeds through TypeScript but fails at "Collecting page data" with a stack trace like:
```
Error: Missing API key. Pass it to the constructor `new Resend("re_123")`
Error: Failed to collect page data for /api/auth/[...all]
```

**Root cause:** An SDK (Resend, Stripe, etc.) is instantiated at module level — `const client = new SDK(process.env.SECRET_KEY)` — and throws in its constructor when the env var is `undefined`. Runtime secrets are intentionally absent from the Docker builder stage; they live in Dokploy's env panel and are injected at container startup. `next build` evaluates all route modules to extract static params, which triggers the module-level instantiation.

**Fix:** Pass a non-empty fallback so the constructor doesn't throw. The real key is only needed when the SDK is actually used (at runtime):
```ts
// Before — throws at build time if env var not set
export const resend = new Resend(process.env.RESEND_API_KEY)

// After — loads cleanly; sends fail at runtime (401) if key not set
export const resend = new Resend(process.env.RESEND_API_KEY ?? 'not-configured')
```

Apply this pattern to any SDK instantiated at module level that throws on missing keys: Resend, Stripe, Twilio, SendGrid, etc.

**`NEXT_PUBLIC_*` vars are different** — they ARE present at build time because they're passed as `ARG`/`ENV` in the Dockerfile builder stage. Server-only secrets are not and must not be — they'd get baked into the image layer.

---

## P18 — Dokploy deploy webhook returns 404

**Symptom:** CI deploy job fails with `curl: (22) The requested URL returned error: 404` when calling `POST /api/application.deploy`.

**Root cause:** The `DOKPLOY_APP_ID` GitHub secret points to an application that doesn't exist in the Dokploy panel — either the app was never created, or the wrong ID was copied.

**Fix:**
1. Open Dokploy panel → create a new Application (source: Docker Image, image: `ghcr.io/yourname/app:latest`)
2. Get the Application ID from the URL: `.../project/xxx/application/APP_ID_HERE`
3. Update the `DOKPLOY_APP_ID` GitHub secret with the correct ID
4. Re-run the failed job from the Actions tab — no code push needed

Note: a 404 (not a connection error) means `DOKPLOY_URL` and `DOKPLOY_API_KEY` are correct. Only the application lookup fails.

---

## P19 — GitHub Actions Node.js 20 deprecation warning (forced to Node.js 24)

**Symptom:** Every Actions run shows warnings like:
```
Node.js 20 actions are deprecated. Actions will be forced to run with Node.js 24
by default starting June 16th, 2026.
```

**Root cause:** `actions/checkout@v4`, `docker/login-action@v3`, etc. internally use Node.js 20. GitHub forced the upgrade to Node.js 24 on June 16, 2026 — after that date, actions may behave unexpectedly on the old runtime.

**Fix:** Add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` to the workflow `env` block to explicitly opt in and silence the warning:
```yaml
env:
  IMAGE: ghcr.io/yourname/app
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

This is a one-line addition; no action version pinning needed.

---

## P20 — Ubuntu 26.04 (resolute): Dokploy installer fails — Docker version not in apt repo

**Symptom:**
```
INFO: Searching repository for VERSION '28.5.0'
ERROR: '28.5.0' not found amongst apt-cache madison results
```

**Root cause:** Dokploy's install script pins a specific Docker CE version (e.g. 28.5.0) that
isn't packaged for Ubuntu 26.04 "resolute" yet. The script exits before installing Docker.

**Fix:** Install Docker CE manually first (the Docker apt source was already added by the
script before it failed), then re-run Dokploy — it detects Docker and skips that step:
```bash
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
export ADVERTISE_ADDR=<vps-public-ip>
curl -sSL https://dokploy.com/install.sh | bash
```

Note: Ubuntu 26.04 "resolute" ships Docker CE 29.x — just not the exact version Dokploy's
script requests. The installed version works fine.

---

## P21 — Dokploy installer fails: no private IP / ADVERTISE_ADDR

**Symptom:**
```
ERROR: We couldn't find a private IP address.
Please set the ADVERTISE_ADDR environment variable manually.
Example: export ADVERTISE_ADDR=192.168.1.100
```

**Root cause:** Hetzner doesn't attach a private network to the server by default. Docker
Swarm's init step requires an advertise address and can't find one when only a public IP
exists.

**Fix:** Export the public IP before running the installer:
```bash
export ADVERTISE_ADDR=<vps-public-ip>
curl -sSL https://dokploy.com/install.sh | bash
```

The public IP works fine as the swarm advertise address for a single-node setup.
For multi-node swarms, add a Hetzner private network and use the private IP instead.

---

## P22 — Heredoc never closes in SSH session (EOF with leading spaces)

**Symptom:** Terminal stays open waiting for more input after the closing `EOF`; Ctrl+C is
the only escape.

**Root cause:** Bash heredoc `<< 'EOF'` only recognises the closing delimiter when `EOF`
appears at column 0 — no leading spaces or tabs. SSH terminals or copy-paste from a
markdown block often insert invisible indentation.

**Fix:** Use `printf` instead, which avoids the heredoc entirely:
```bash
printf 'Line1\nLine2\nLine3\n' > /path/to/file
```
Or, if you need heredoc, use `<<-'EOF'` (note the dash) which strips **leading tabs** (not
spaces). Either way, always paste and verify with `cat` before reloading the service.

---

## P23 — Embed widget chat returns 403 STORE_URL_REQUIRED / no conversation logs appear

**Symptom:** The chat widget loads and sends messages, but responses never arrive. No conversations appear in the dashboard. The chat API returns `403` with `code: 'STORE_URL_REQUIRED'` even for bots that have no Store URL restriction.

**Root cause:** The CORS origin guard in the chat API identifies "requests from the app itself" by comparing `request.headers.origin` to `new URL(process.env.NEXT_PUBLIC_APP_URL).origin`. If `NEXT_PUBLIC_APP_URL` is set to the wrong subdomain (e.g. `https://octively.com` instead of `https://admin.octively.com`), requests from the embed-test page on the correct subdomain are treated as external and blocked.

**Fix:** In both the GitHub Actions secret AND the Dokploy runtime env, set:
```
NEXT_PUBLIC_APP_URL=https://admin.octively.com   # the dashboard subdomain, not marketing
```
`NEXT_PUBLIC_APP_URL` is baked at Docker build time (passed as `ARG`), so the GitHub secret
must be correct. The Dokploy runtime env var fixes server-side code immediately on restart.

---

## P24 — Google OAuth "Error 400: redirect_uri_mismatch" on login

**Symptom:** Clicking "Sign in with Google" on the dashboard shows Google's error page:
`"Access blocked: This app's request is invalid"` and `"redirect_uri_mismatch"`.

**Root cause:** BetterAuth constructs the Google callback URL as `{BETTER_AUTH_URL}/api/auth/callback/google`. If `BETTER_AUTH_URL` is set to the marketing domain (`https://octively.com`) instead of the dashboard subdomain, the OAuth callback URI sent to Google is wrong and doesn't match any entry in the Google Console authorized redirect URIs list.

**Fix (two steps):**

1. **Dokploy runtime env** — change:
   ```
   BETTER_AUTH_URL=https://admin.octively.com   # was https://octively.com
   ```
   Restart the container.

2. **Google Cloud Console** — APIs & Services → Credentials → your OAuth 2.0 Client → Authorized redirect URIs → Add:
   ```
   https://admin.octively.com/api/auth/callback/google
   ```

No code change needed. The BetterAuth auth client (`createAuthClient()` with no `baseURL`) auto-detects the current origin correctly — only the server-side `BETTER_AUTH_URL` is wrong.

---

## P25 — Docker disk fills up over time (old image layers + build cache)

**Symptom:** Disk usage climbs after each deploy. `df -h` shows 40–70 % used even with
little app data. Dokploy monitoring shows Docker Disk Usage at 30–50 GB.

**Root cause:** Each GitHub Actions → GHCR push leaves dangling image layers on the VPS.
Dokploy pulls the new `:latest` image but the old layers stay on disk indefinitely. Build
cache from previous pulls also accumulates. There is no auto-cleanup by default.

**Real numbers (Octively CX33):**
- Before prune: Disk 34.2 GB / 74.78 GB (46%), Docker 50.35 GB total
- After `docker system prune -f`: Disk **14.39 GB** (19%), Docker **11.06 GB**, freed **20.26 GB**

**Fix — one-time cleanup (run on the VPS):**
```bash
docker system prune -f
```
Removes: stopped containers, dangling images, unused build cache. Safe on a live server —
running containers and their images are untouched. Do NOT add `--volumes` (wipes DB volumes).

**Fix — permanent: weekly server-side cron (run on the VPS):**
```bash
(crontab -l 2>/dev/null; echo "0 2 * * 0 docker system prune -f >> /var/log/docker-prune.log 2>&1") | crontab -
```
Runs every Sunday at 2 AM UTC. Verify with `crontab -l`.

**Why NOT to do this from GitHub Actions:**
Triggering the prune via SSH from the workflow requires a private SSH key in GitHub
secrets — unnecessary attack surface. A server-side cron is simpler and safer.

**SSH access note for this project:**
The deploy key is `~/.ssh/octively_dokploy`. If `ssh-add` fails ("Could not open a
connection to your authentication agent"), start the agent first:
```bash
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/octively_dokploy
ssh root@<vps-ip> "docker system prune -f"
```

---

## P26 — Sanity Studio / blog shows "not configured" despite correct GHCR image

**Symptom:** `/content-studio` shows "Content Studio not configured" and the blog is
empty, even though GitHub Actions built the image correctly with all `NEXT_PUBLIC_SANITY_*`
secrets confirmed present (length checks pass).

**Root cause:** The Dokploy app's **Provider** is set to "Github" / "Gitlab" / "Git"
instead of "Docker". This makes Dokploy clone the repo and build its own Docker image from
the Dockerfile, completely bypassing the GHCR image. Since no build-args are passed during
Dokploy's own build, `NEXT_PUBLIC_SANITY_PROJECT_ID` is empty at build time. The
`force-static` page gets the "not configured" HTML baked in permanently — no amount of
GitHub Actions rebuilds fixes it because Dokploy never pulls the GHCR image.

**Fix:**
1. Dokploy panel → your app → General → **Provider**
2. Switch from "Github"/"Git" to **"Docker"**
3. Set image: `ghcr.io/yourname/app:latest`, registry: `ghcr.io`, username + PAT
4. Save → Redeploy

**Verification (on VPS):**
```bash
docker exec <container-name> printenv | grep NEXT_PUBLIC_SANITY
# Should show: NEXT_PUBLIC_SANITY_PROJECT_ID=bry0vfky
```

**Why this is easy to miss:** The "Github" provider *looks* correct (it pulls from the same
repo) but the build mechanism is entirely different. The deploy log will show "Cloning Repo"
followed by a full Docker build — that's the telltale sign.

---

## Decision matrix (when you hit something weird)

| First thing to check | Likely culprit |
|---|---|
| Container won't start | Missing `output: 'standalone'` or runner COPY lines |
| Port still open after UFW deny | Docker-bypasses-UFW; check Hetzner Cloud Firewall |
| Cert won't issue | DNS record is orange-cloud; grey it |
| Redirect loop | Cloudflare SSL = Flexible; set Full (Strict) |
| Env var undefined in browser | Missing build-arg in CI; it's build-time not runtime |
| ONNX module not found | Missing explicit COPY of native packages in runner |
| Node engine error | Dockerfile base is node:20; needs node:22 |
| Slow first request | Model cache volume not mounted |
| GHCR push "must be lowercase" | `github.repository_owner` has mixed case; hardcode lowercase |
| `npm ci` "Missing from lock file" | Cross-platform optional dep — switch to `npm install` in Dockerfile |
| "Missing API key" during page data | SDK throws in constructor — add `?? 'not-configured'` fallback |
| Dokploy deploy webhook returns 404 | App not created in panel yet or wrong `DOKPLOY_APP_ID` secret |
| Node.js 20 actions deprecation warning | Add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` to workflow env |
| Dokploy install "version not found" | Ubuntu 26.04 — install Docker manually first (P20) |
| "couldn't find a private IP address" | No Hetzner private network — `export ADVERTISE_ADDR=<public-ip>` (P21) |
| Heredoc never closes in SSH | `EOF` has leading spaces — use `printf` instead (P22) |
| Chat 403 / no conversation logs | `NEXT_PUBLIC_APP_URL` points to wrong subdomain (P23) |
| Google "redirect_uri_mismatch" | `BETTER_AUTH_URL` points to wrong subdomain (P24) |
| Disk filling up / Docker at 30–50 GB | Old image layers accumulating — `docker system prune -f` + weekly cron (P25) |
| Sanity Studio "not configured" despite correct secrets | Dokploy Provider is "Github" instead of "Docker" — it rebuilds from source, skipping GHCR (P26) |
