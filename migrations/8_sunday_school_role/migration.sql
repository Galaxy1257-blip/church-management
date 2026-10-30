-- 8_sunday_school_role: Sunday School teachers can hold their own login. The
-- Care section is limited to ushers and this role.
ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'SUNDAY_SCHOOL';
