-- Auto-run on first container boot: create the runtime roles so FORCE RLS
-- actually applies (superusers bypass RLS even with FORCE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_dev_password' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_user') THEN
    CREATE ROLE platform_user LOGIN PASSWORD 'platform_dev_password' BYPASSRLS;
  END IF;
END $$;
