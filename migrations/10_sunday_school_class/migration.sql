-- 10_sunday_school_class: a Sunday School teacher now sees ONE class, not the
-- whole care queue. The office assigns the class (age bracket + Boys/Girls/All),
-- and welfare moves behind its own permission so care access no longer implies
-- access to money.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "careClassBracketId" UUID;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "careClassSegment" TEXT;

-- The database role rows are authoritative at runtime, so existing churches
-- must be brought in line with the shared presets.
UPDATE "Role"
SET permissions = ARRAY['church:read', 'care:read', 'care:write']::text[]
WHERE key = 'SUNDAY_SCHOOL';

-- Existing ushers, follow-up teams and elders can still publish to the prayer
-- wall; the new permission splits moderation from writing.
UPDATE "Role"
SET permissions = (
  SELECT array_agg(DISTINCT p)
  FROM unnest(permissions || ARRAY['care:moderate']) AS p
)
WHERE key IN ('USHER', 'FOLLOWUP_TEAM', 'ELDER');

-- Welfare is no longer implied by care:read. Follow-up, elders and finance
-- keep it; ushers and teachers do not get it.
UPDATE "Role"
SET permissions = (
  SELECT array_agg(DISTINCT p)
  FROM unnest(permissions || ARRAY['welfare:read', 'welfare:write']) AS p
)
WHERE key IN ('FOLLOWUP_TEAM', 'ELDER', 'FINANCE_ADMIN');

-- PASTOR was seeded as an explicit copy of PERMISSIONS, not a wildcard.
UPDATE "Role"
SET permissions = (
  SELECT array_agg(DISTINCT p)
  FROM unnest(permissions || ARRAY['care:moderate', 'welfare:read', 'welfare:write']) AS p
)
WHERE key = 'PASTOR';
