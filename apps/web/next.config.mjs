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

const nextConfig = {
  reactStrictMode: true,
  // Workspaces are symlinked; keep tracing rooted at the monorepo.
  outputFileTracingRoot: path.join(dir, '../..'),
};

export default nextConfig;
