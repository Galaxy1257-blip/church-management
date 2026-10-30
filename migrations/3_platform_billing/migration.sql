-- 3_platform_billing: Paystack subscription billing + Platform Office accounts.
-- Additive only; enums are guarded so the file can be re-run against chms and chms_test.
--
--   * Church.* billing fields -> trial / paid / grace / paused state machine
--   * SubscriptionPayment      -> one row per church per period ("2026-11")
--   * PlatformUser             -> OmniLabs staff login for the support office
--
-- Churches that predate billing (trialEndsAt IS NULL AND paidUntil IS NULL) are
-- grandfathered active by the billing engine; no backfill is required.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformRole') THEN
    CREATE TYPE "PlatformRole" AS ENUM ('OWNER', 'SUPPORT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionMethod') THEN
    CREATE TYPE "SubscriptionMethod" AS ENUM ('PAYSTACK', 'CASH', 'TRANSFER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');
  END IF;
END $$;

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "monthlyFeeMinor" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "graceDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "paidUntil" TIMESTAMP(3);
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingPausedAt" TIMESTAMP(3);
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingPhone" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingNote" TEXT;

-- Billing day is a day of the month, not a cron expression.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'church_billing_day_range') THEN
    ALTER TABLE "Church" ADD CONSTRAINT church_billing_day_range
      CHECK ("billingDay" BETWEEN 1 AND 28);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'church_fee_positive') THEN
    ALTER TABLE "Church" ADD CONSTRAINT church_fee_positive
      CHECK ("monthlyFeeMinor" > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PlatformUser" (
  "id"           UUID NOT NULL,
  "name"         TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role"         "PlatformRole" NOT NULL DEFAULT 'SUPPORT',
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "totpSecret"   TEXT,
  "lastLoginAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformUser_email_key" ON "PlatformUser"("email");
CREATE INDEX IF NOT EXISTS "PlatformUser_role_idx" ON "PlatformUser"("role");

CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
  "id"             UUID NOT NULL,
  "churchId"       UUID NOT NULL,
  "period"         TEXT NOT NULL,
  "amountMinor"    INTEGER NOT NULL,
  "method"         "SubscriptionMethod" NOT NULL,
  "status"         "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "reference"      TEXT NOT NULL,
  "providerRef"    TEXT,
  "paidAt"         TIMESTAMP(3),
  "recordedById"   TEXT,
  "recordedByName" TEXT,
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_reference_key" ON "SubscriptionPayment"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_churchId_period_key" ON "SubscriptionPayment"("churchId", "period");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_churchId_createdAt_idx" ON "SubscriptionPayment"("churchId", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_status_idx" ON "SubscriptionPayment"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionPayment_churchId_fkey') THEN
    ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_churchId_fkey"
      FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_amount_positive') THEN
    ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT sub_amount_positive
      CHECK ("amountMinor" > 0);
  END IF;
END $$;
