-- 9_sunday_school_backfill: give every existing church the new role (new
-- churches get it from seedChurchDefaults), and widen the usher preset so
-- ushers can actually use the Care section they are allowed to see.
INSERT INTO "Role" (id, "churchId", key, name, permissions)
SELECT
  gen_random_uuid(),
  c.id,
  'SUNDAY_SCHOOL',
  'Sunday School Teacher',
  ARRAY[
    'church:read',
    'services:read',
    'members:read',
    'members:write',
    'headcount:write',
    'checkin:write',
    'visitors:read',
    'visitors:write',
    'care:read',
    'care:write'
  ]::text[]
FROM "Church" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" r WHERE r."churchId" = c.id AND r.key = 'SUNDAY_SCHOOL'
);

UPDATE "Role"
SET permissions = (
  SELECT array_agg(DISTINCT p)
  FROM unnest(permissions || ARRAY['care:read', 'care:write']) AS p
)
WHERE key = 'USHER';
