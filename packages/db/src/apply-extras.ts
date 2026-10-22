// Applies extras.sql (RLS policies, triggers, constraints, audit chain)
// via a single simple-protocol query. Run as the schema owner, AFTER
// `prisma migrate deploy`. Idempotent (all statements are IF NOT EXISTS
// / OR REPLACE / DROP+CREATE).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const sqlPath = resolve(__dirname, '../../../extras.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql); // multi-statement simple query
    console.log(`extras.sql applied from ${sqlPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
