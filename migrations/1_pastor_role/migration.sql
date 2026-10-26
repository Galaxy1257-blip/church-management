-- 1_pastor_role: the head-of-church role that sees every module.
-- Additive only: existing rows are untouched, and ADD VALUE IF NOT EXISTS keeps
-- this safe to re-run against chms and chms_test.
ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'PASTOR';
