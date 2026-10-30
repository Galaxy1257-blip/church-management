// Runs as the DB owner (superuser). Idempotent: creates the app runtime roles
// and grants them table access. The app MUST connect as app_user so FORCE
// RLS actually applies (superusers bypass RLS even with FORCE).
import { Client } from 'pg';
import 'dotenv/config';

async function main(): Promise<void> {
  const url = process.env.OWNER_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('OWNER_DATABASE_URL (or DATABASE_URL) is not set');
    process.exit(1);
  }
  const appPassword = process.env.APP_USER_PASSWORD ?? 'app_dev_password';
  const platformPassword = process.env.PLATFORM_USER_PASSWORD ?? 'platform_dev_password';

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user LOGIN PASSWORD '${appPassword}' NOBYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_user') THEN
          CREATE ROLE platform_user LOGIN PASSWORD '${platformPassword}' BYPASSRLS;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO app_user, platform_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, platform_user;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, platform_user;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, platform_user;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user, platform_user;
    `);
    // Heal passwords unconditionally: whichever step created the role first
    // (extras.sql DO-block on some paths), the credentials in the connection
    // URLs must always end up valid — caught by db:verify 22 Oct (platform_user
    // existed passwordless/with a stale password => Prisma P1000).
    await client.query(`
      ALTER ROLE app_user LOGIN PASSWORD '${appPassword}';
      ALTER ROLE platform_user LOGIN PASSWORD '${platformPassword}';
    `);
    // The blanket grant above must not hand tenant code the platform staff
    // table. Re-assert the revoke on every run (extras.sql does the same for
    // the RLS policy; this is the grant half).
    await client.query(`
      DO $$ BEGIN
        IF to_regclass('public."PlatformUser"') IS NOT NULL THEN
          REVOKE ALL ON "PlatformUser" FROM app_user;
        END IF;
      END $$;
    `);
    console.log('app_user + platform_user ready (grants + passwords applied)');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
