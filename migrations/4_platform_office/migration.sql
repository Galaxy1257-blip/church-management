-- 4_platform_office: support override for the billing lock.
-- The platform office can pause or resume a workspace regardless of the dates
-- (disputes, comped months); normal billing still derives from dates.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "billingLocked" BOOLEAN NOT NULL DEFAULT false;
