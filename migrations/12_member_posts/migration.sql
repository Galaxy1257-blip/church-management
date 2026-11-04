-- 12_member_posts: members send in notices and prayer requests from the
-- companion. A member's notice waits as PENDING until a leader approves it;
-- staff-written notices keep the APPROVED default, so nothing existing changes.
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "submittedByMemberId" UUID;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "moderation" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "PrayerRequest" ADD COLUMN IF NOT EXISTS "photoDataUrl" TEXT;
CREATE INDEX IF NOT EXISTS "Announcement_churchId_moderation_idx" ON "Announcement" ("churchId", "moderation");
