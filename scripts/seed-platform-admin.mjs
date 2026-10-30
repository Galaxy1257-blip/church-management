// Create or update a Platform Office login (OmniLabs staff).
//
//   PLATFORM_ADMIN_EMAIL=you@omnilabs.dev \
//   PLATFORM_ADMIN_PASSWORD='a long password' npm run platform:admin
//
// Reads its credentials from the environment only — never put them in a file.
// Run as the schema owner: the platform_user table is denied to app_user.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const email = (process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.PLATFORM_ADMIN_PASSWORD ?? '';
const name = (process.env.PLATFORM_ADMIN_NAME ?? 'Platform Owner').trim();
const role = (process.env.PLATFORM_ADMIN_ROLE ?? 'OWNER').toUpperCase();

if (!email.includes('@')) {
  console.error('PLATFORM_ADMIN_EMAIL is required (e.g. you@omnilabs.dev)');
  process.exit(1);
}
if (password.length < 10) {
  console.error('PLATFORM_ADMIN_PASSWORD must be at least 10 characters');
  process.exit(1);
}
if (role !== 'OWNER' && role !== 'ONBOARDER' && role !== 'SUPPORT') {
  console.error('PLATFORM_ADMIN_ROLE must be OWNER, ONBOARDER or SUPPORT');
  process.exit(1);
}

const url = process.env.OWNER_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('OWNER_DATABASE_URL (or DATABASE_URL) is not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const hash = await bcrypt.hash(password, 12);
  const existing = await client.query('SELECT id FROM "PlatformUser" WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    await client.query(
      'UPDATE "PlatformUser" SET "passwordHash" = $2, name = $3, role = $4, "isActive" = true WHERE email = $1',
      [email, hash, name, role],
    );
    console.log(`updated platform ${role.toLowerCase()} ${email}`);
  } else {
    await client.query(
      `INSERT INTO "PlatformUser" (id, name, email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, $4, $5, true)`,
      [randomUUID(), name, email, hash, role],
    );
    console.log(`created platform ${role.toLowerCase()} ${email}`);
  }
  const count = await client.query('SELECT count(*)::int AS n FROM "PlatformUser" WHERE "isActive"');
  console.log(`active platform staff: ${count.rows[0].n}`);
} finally {
  await client.end();
}
