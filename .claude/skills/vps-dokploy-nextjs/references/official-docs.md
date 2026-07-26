# Official Documentation URLs

Always verify against these sources when something behaves unexpectedly or when a version
number appears in an error. Training data goes stale; docs don't.

## Core stack

| Resource | URL | Use for |
|---|---|---|
| Next.js standalone output | https://nextjs.org/docs/app/api-reference/next-config-js/output | `output: 'standalone'`, standalone tracing behavior |
| Next.js serverExternalPackages | https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages | Keeping native deps out of the bundler |
| Next.js with-docker example | https://github.com/vercel/next.js/tree/canary/examples/with-docker | Official reference Dockerfile |
| Dokploy docs | https://docs.dokploy.com | API endpoint, application deploy, registry config |
| Dokploy security docs | https://docs.dokploy.com/docs/core/remote-servers/security | Docker-bypasses-UFW official confirmation |
| Dokploy API reference | https://docs.dokploy.com/docs/core/api | `/api/application.deploy` endpoint signature |

## Docker + GitHub Actions

| Resource | URL | Use for |
|---|---|---|
| docker/build-push-action | https://github.com/docker/build-push-action | `platforms`, `cache-from/to`, `build-args` syntax |
| docker/login-action | https://github.com/docker/login-action | GHCR login via `GITHUB_TOKEN` |
| GHCR (GitHub Container Registry) | https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry | Image visibility, pull credentials |
| GitHub Actions permissions | https://docs.github.com/en/actions/security-guides/automatic-token-authentication | `packages: write` for GITHUB_TOKEN |

## SSL / DNS

| Resource | URL | Use for |
|---|---|---|
| Cloudflare SSL modes | https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/ | Full vs Full (Strict) vs Flexible |
| Cloudflare Full (Strict) | https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/ | Why Flexible causes redirect loops with Traefik |
| Cloudflare Config Rules | https://developers.cloudflare.com/rules/configuration-rules/ | Bypass HTTPS rewrites for ACME challenge |
| Let's Encrypt HTTP-01 challenge | https://letsencrypt.org/docs/challenge-types/ | Why grey-cloud is needed during cert issuance |
| Traefik Let's Encrypt | https://doc.traefik.io/traefik/https/acme/ | How Traefik does ACME (confirms HTTP-01 default) |

## ONNX / Transformers.js

| Resource | URL | Use for |
|---|---|---|
| Transformers.js Node.js guide | https://huggingface.co/docs/transformers.js/guides/node | `pipeline()` API, dtype options, Node requirements |
| Transformers.js package (npm) | https://www.npmjs.com/package/@huggingface/transformers | Current version, engine requirements |
| `Xenova/bge-base-en-v1.5` model | https://huggingface.co/Xenova/bge-base-en-v1.5 | Model card, dimension (768), usage |
| BGE embedding guide | https://huggingface.co/BAAI/bge-base-en-v1.5 | Query instruction prefix requirement |
| onnxruntime-node | https://www.npmjs.com/package/onnxruntime-node | Version, native binary platform support |

## VPS / Hetzner

| Resource | URL | Use for |
|---|---|---|
| Hetzner Cloud Firewall | https://docs.hetzner.com/cloud/firewalls/overview/ | Network-edge firewall (authoritative Docker gate) |
| Hetzner instance pricing | https://www.hetzner.com/cloud | Current CX line pricing |
| Hetzner Dokploy tutorial | https://community.hetzner.com/tutorials/setup-dokploy-on-your-vps | Official Hetzner community guide (confirms arm64 "untested") |
| Ubuntu 24.04 sshd cloud-init | https://cloudinit.readthedocs.io/en/latest/reference/modules.html | Why `50-cloud-init.conf` overrides sshd_config |
| ufw-docker | https://github.com/chaifeng/ufw-docker | Making UFW actually block Docker-published ports |

## Checking for version changes

When an error mentions a version or engine constraint:
1. Check the package's `package.json` `engines` field on npm or the GitHub repo
2. For Dokploy API changes: `GET /api/version` on your panel instance
3. For Next.js standalone changes: check the Next.js changelog for the `output` option

Node version requirements change with major Transformers.js releases — always verify
`@huggingface/transformers` engines field before pinning the Docker base image.
