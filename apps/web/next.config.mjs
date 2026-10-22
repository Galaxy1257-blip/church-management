/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  // Workspaces are symlinked; keep tracing rooted at the monorepo.
  outputFileTracingRoot: path.join(dir, '../..'),
};

export default nextConfig;
