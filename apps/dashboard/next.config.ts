import type { NextConfig } from 'next';

// Puppeteer + @aws-sdk/client-s3 are only ever used server-side (the internal
// render route) — kept as regular server dependencies, no special webpack
// config needed for them under the App Router's default Node.js runtime.
const nextConfig: NextConfig = {
  devIndicators: false,
  // Gate 'standalone' on a Docker-only build flag (vps-dokploy-nextjs skill,
  // dockerfile-patterns.md) — forcing it outside Docker would break `next dev`.
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  // puppeteer does dynamic requires the standalone tracer doesn't follow
  // reliably (same class of issue as the skill's ONNX/sharp pitfall, P5) —
  // keep it external and copy it explicitly in the Dockerfile's runner stage.
  serverExternalPackages: ['puppeteer'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'media.yousufliving.com',
      },
    ],
  },
};

export default nextConfig;
