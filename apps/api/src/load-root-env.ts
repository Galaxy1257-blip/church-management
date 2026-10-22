// Loads the REPO-ROOT .env regardless of process.cwd().
// npm run dev:api executes with cwd=apps/api, so plain `dotenv/config`
// (cwd-based) never found the root .env and boot failed with
// "Invalid environment: DATABASE_URL: Required". Three levels up from
// apps/api/{src|dist}/ is the repo root — same for either layout.
import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';

dotenv({ path: resolve(__dirname, '../../../.env') });
dotenv(); // optional app-local .env fills only the keys still unset
