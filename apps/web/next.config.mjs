/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// NEXT_PUBLIC_* values are inlined into the client bundle at build time. A Render
// build without NEXT_PUBLIC_API_URL would silently ship a bundle that calls
// http://localhost:4000 — deployed, healthy-looking and broken. Fail the build
// instead. Locally the var is optional (lib/api.ts falls back to localhost).
if (process.env.RENDER && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is required on Render, e.g. https://<chms-api-host>/api/v1 ' +
      '(set it in the chms-web service environment before building)',
  );
}

// The per-request nonce CSP is emitted by src/middleware.ts. These headers are
// static and safe to apply to every response, including assets and metadata.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  // Workspaces are symlinked; keep tracing rooted at the monorepo.
  outputFileTracingRoot: path.join(dir, '../..'),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    // No remote images are optimised; an allowlist here would widen SSRF surface.
    remotePatterns: [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
