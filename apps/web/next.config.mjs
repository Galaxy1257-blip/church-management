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

// Security headers applied to every response. The API is called cross-origin
// from the browser (NEXT_PUBLIC_API_URL), so connect-src must name it; img-src
// allows data: for the in-app profile-photo/logo data URLs. 'unsafe-inline' on
// style-src is required by Next's injected styles; script-src keeps no inline
// except Next's own bootstrap, which is why 'unsafe-inline' is scoped to nothing
// here — a nonce would need middleware, tracked as a follow-up.
const API_ORIGIN = (() => {
  try {
    if (process.env.NEXT_PUBLIC_API_URL) return new globalThis.URL(process.env.NEXT_PUBLIC_API_URL).origin;
  } catch {
    /* fall through */
  }
  // Dev has no NEXT_PUBLIC_API_URL and the API runs on :4000 — allow it, or the
  // CSP would block every fetch the app makes locally.
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000';
})();
const connectSrc = ["'self'", API_ORIGIN].filter(Boolean).join(' ');
const csp = [
  "default-src 'self'",
  // Next injects a small inline bootstrap; 'unsafe-inline' here is the pragmatic
  // floor until a nonce middleware lands. No 'unsafe-eval' in production.
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${connectSrc}`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
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
