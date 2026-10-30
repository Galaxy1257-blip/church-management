-- 2_owner_round2: owner feedback round 2 (29 Oct 2026).
-- Additive only, IF NOT EXISTS keeps it safe to re-run against chms and chms_test.
--   * AgeBracket.maleLabel / femaleLabel -> "Sunday School (Boys)" style split labels
--   * Member.photoDataUrl -> small profile photo (data URL, ~200KB cap)
--   * Announcement.memberId / photoDataUrl -> funeral/outdooring notice about a member
ALTER TABLE "AgeBracket" ADD COLUMN IF NOT EXISTS "maleLabel" TEXT;
ALTER TABLE "AgeBracket" ADD COLUMN IF NOT EXISTS "femaleLabel" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "photoDataUrl" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "memberId" UUID;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "photoDataUrl" TEXT;
CREATE INDEX IF NOT EXISTS "Announcement_memberId_idx" ON "Announcement"("memberId");
