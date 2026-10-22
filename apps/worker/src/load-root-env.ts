// Loads the REPO-ROOT .env regardless of process.cwd() (npm -w runs from
// apps/worker). Three levels up from apps/worker/{src|dist}/ is the repo root.
import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';

dotenv({ path: resolve(__dirname, '../../../.env') });
dotenv(); // optional app-local .env fills only the keys still unset
