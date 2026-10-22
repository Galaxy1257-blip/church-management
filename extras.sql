-- =====================================================================
-- ChMS extras.sql: raw SQL that Prisma cannot express.
-- Run AFTER the Prisma migration, as the schema owner (not as app_user).
-- NOT executed or tested yet: run it against a scratch database first.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- App role: no BYPASSRLS, not the table owner
-- CREATE ROLE app_user LOGIN PASSWORD '...' NOBYPASSRLS;
-- GRANT USAGE ON SCHEMA public TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Platform role: bypasses RLS for cross-tenant jobs (worker, webhook reference
-- lookup, reconciler). NEVER used by request-scoped feature code.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_user') THEN
    CREATE ROLE platform_user LOGIN BYPASSRLS;
  END IF;
END $$;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO platform_user;
-- GRANT USAGE ON SCHEMA public TO platform_user;
-- Also grant sequence usage for audit_event bigserial:
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, platform_user;


-- ---------------------------------------------------------------------
-- 1. Row-Level Security: tenant isolation on every table with "churchId"
-- The app sets app.church_id per transaction (withTenant helper).
-- ---------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'churchId'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("churchId"::text = (SELECT current_setting(''app.church_id'', true)))',
      t.table_name);
  END LOOP;
END $$;
-- Note: "churchId" is uuid on most tables and text on a few (SmsOptOut, AlertState, ChurchKey);
-- comparing as text works for both. Tables with a NULLable churchId (InboundSms, ReconciliationRun)
-- are hidden from app_user unless churchId matches; platform jobs use a separate role.

-- Branch scope (second policy), example for Transaction. app.branch_ids is a comma list; empty = all branches.
-- Policies are OR-ed by default, so use RESTRICTIVE to make it an additional requirement.
DROP POLICY IF EXISTS branch_scope ON "Transaction";
CREATE POLICY branch_scope ON "Transaction" AS RESTRICTIVE
  USING (
    COALESCE(NULLIF(current_setting('app.branch_ids', true), ''), '') = ''
    OR "branchId"::text = ANY (string_to_array(current_setting('app.branch_ids', true), ','))
  );
-- Repeat for Member, Visitor, Service, Group, Expense, Pledge, GivingBatch (all tables with "branchId").

-- Counseling notes: readable only by author or explicit sharedWith (restrictive, in addition to tenant policy)
DROP POLICY IF EXISTS counseling_access ON "CounselingNote";
CREATE POLICY counseling_access ON "CounselingNote" AS RESTRICTIVE
  USING (
    "authorId"::text = current_setting('app.user_id', true)
    OR current_setting('app.user_id', true) = ANY (ARRAY(SELECT unnest("sharedWith")::text))
  );

-- ---------------------------------------------------------------------
-- 2. Integrity constraints
-- ---------------------------------------------------------------------
-- PG has no ADD CONSTRAINT IF NOT EXISTS — guard each via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tx_gift_positive') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT tx_gift_positive CHECK ("giftMinor" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tx_charged_ge_gift') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT tx_charged_ge_gift CHECK ("chargedMinor" >= "giftMinor");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hc_delta_valid') THEN
    ALTER TABLE "Headcount" ADD CONSTRAINT hc_delta_valid CHECK (delta IN (-1, 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exp_amount_positive') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT exp_amount_positive CHECK ("amountMinor" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pledge_amount_positive') THEN
    ALTER TABLE "Pledge" ADD CONSTRAINT pledge_amount_positive CHECK ("amountMinor" > 0);
  END IF;
END $$;

-- Fast reconciler scan for the drip engine
CREATE INDEX IF NOT EXISTS idx_progress_due ON "FollowUpProgress" ("nextRunAt") WHERE state = 'ACTIVE';

-- Fuzzy duplicate matching during member import
CREATE INDEX IF NOT EXISTS idx_member_name_trgm ON "Member"
  USING gin ((lower("firstName" || ' ' || "lastName")) gin_trgm_ops);

-- Foreign keys not expressed in Prisma (soft FKs): add the ones you want enforced, for example
-- ALTER TABLE "Transaction" ADD CONSTRAINT tx_branch_fk FOREIGN KEY ("branchId") REFERENCES "Branch"(id);

-- ---------------------------------------------------------------------
-- 3. Opt-out enforcement: block marketing-style sends to opted-out numbers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_opted_out() RETURNS trigger AS $$
BEGIN
  IF NEW.source IN ('CAMPAIGN','DRIP','ANNOUNCEMENT','EVENT','ROSTER') AND EXISTS (
    SELECT 1 FROM "SmsOptOut" o
    WHERE o."churchId" = NEW."churchId"::text AND o."phoneE164" = NEW."toE164") THEN
    RAISE EXCEPTION 'recipient opted out';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_block_opted_out ON "SmsLog";
CREATE TRIGGER trg_block_opted_out BEFORE INSERT ON "SmsLog"
  FOR EACH ROW EXECUTE FUNCTION block_opted_out();

-- ---------------------------------------------------------------------
-- 4. Immutable approved batches and successful transactions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_approved_tx() RETURNS trigger AS $$
DECLARE b_status text;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'SUCCESS' THEN
    RAISE EXCEPTION 'successful transactions cannot be deleted; create a REVERSED entry';
  END IF;
  IF OLD."batchId" IS NOT NULL THEN
    SELECT status::text INTO b_status FROM "GivingBatch" WHERE id = OLD."batchId";
    IF b_status IN ('APPROVED','DEPOSITED') THEN
      RAISE EXCEPTION 'transaction belongs to an approved batch and is immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_protect_tx ON "Transaction";
CREATE TRIGGER trg_protect_tx BEFORE UPDATE OR DELETE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION protect_approved_tx();
-- Caveat: this also blocks the legitimate PENDING -> SUCCESS update only if the row already sits in an
-- approved batch, which never happens for gateway payments. Test with your batch workflow before relying on it.

-- Append-only SmsLedger. The ONE permitted mutation is the refId backfill
-- (NULL -> SmsLog id) that sms-dispatcher + the worker send jobs perform after
-- their log row exists; every other update/delete raises. Caught by db:verify
-- 22 Oct: a hard block made every first dispatch crash with P0001.
CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."refId" IS NULL AND NEW."refId" IS NOT NULL
     AND NEW."id" = OLD."id"
     AND NEW."churchId" = OLD."churchId"
     AND NEW."delta" = OLD."delta"
     AND NEW."reason" = OLD."reason"
     AND NEW."refType" IS NOT DISTINCT FROM OLD."refType"
     AND NEW."balanceAfter" = OLD."balanceAfter"
     AND NEW."idempotencyKey" = OLD."idempotencyKey"
     AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ledger_no_mutate ON "SmsLedger";
CREATE TRIGGER trg_ledger_no_mutate BEFORE UPDATE OR DELETE ON "SmsLedger"
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

-- ---------------------------------------------------------------------
-- 5. Hash-chained audit log (replaces the AuditLog model from early drafts)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_event (
  id         bigserial PRIMARY KEY,
  church_id  uuid NOT NULL,
  seq        bigint NOT NULL,
  actor_id   uuid,
  action     text NOT NULL,
  entity     text,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  ip         inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  prev_hash  bytea,
  row_hash   bytea NOT NULL,
  UNIQUE (church_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_audit_church_time ON audit_event (church_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_event (church_id, action);

CREATE OR REPLACE FUNCTION audit_chain() RETURNS trigger AS $$
DECLARE prev audit_event%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text, 0));
  SELECT * INTO prev FROM audit_event WHERE church_id = NEW.church_id ORDER BY seq DESC LIMIT 1;
  NEW.seq        := COALESCE(prev.seq, 0) + 1;
  NEW.prev_hash  := prev.row_hash;
  NEW.created_at := now();
  NEW.row_hash   := digest(
    COALESCE(NEW.prev_hash, ''::bytea) ||
    convert_to(concat_ws('|', NEW.church_id, NEW.seq, NEW.actor_id, NEW.action, NEW.entity, NEW.entity_id,
                         NEW.before::text, NEW.after::text, NEW.created_at), 'UTF8'), 'sha256');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_chain ON audit_event;
CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_chain();

CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_event is append-only'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_no_mutate ON audit_event;
CREATE TRIGGER trg_audit_no_mutate BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_immutable();
DROP TRIGGER IF EXISTS trg_audit_no_truncate ON audit_event;
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();

-- REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM app_user;
-- GRANT INSERT, SELECT ON audit_event TO app_user;
-- A nightly job re-walks each church's chain and anchors the head hash outside the database.

-- Chain verifier: returns the first broken seq (mismatched prev_hash, row_hash,
-- or a gap), or NULL when the chain is intact. Used by the nightly worker.
CREATE OR REPLACE FUNCTION audit_verify(p_church_id uuid)
RETURNS TABLE (first_bad_seq bigint) AS $$
DECLARE
  r record;
  prev_hash bytea := NULL;
  prev_seq bigint := 0;
  computed bytea;
BEGIN
  FOR r IN SELECT * FROM audit_event WHERE church_id = p_church_id ORDER BY seq LOOP
    computed := digest(
      COALESCE(prev_hash, ''::bytea) ||
      convert_to(concat_ws('|', r.church_id, r.seq, r.actor_id, r.action, r.entity, r.entity_id,
                           r.before::text, r.after::text, r.created_at), 'UTF8'), 'sha256');
    IF r.seq <> prev_seq + 1
       OR (r.prev_hash IS DISTINCT FROM prev_hash)
       OR (r.row_hash IS DISTINCT FROM computed) THEN
      first_bad_seq := r.seq;
      RETURN NEXT;
      RETURN;
    END IF;
    prev_hash := r.row_hash;
    prev_seq := r.seq;
  END LOOP;
  RETURN;
END $$ LANGUAGE plpgsql;
