-- 13_notifications: in-app reminders/notifications for the companion, plus
-- welfare requests that can be routed to one member instead of the leaders.
--
-- A Notification table already existed (id, churchId, userId, kind, title, body,
-- readAt, createdAt) with no rows; this adds the scheduling/dedupe columns it was
-- missing instead of replacing it. Written additively so it also works on a fresh DB.
ALTER TABLE "WelfareRequest" ADD COLUMN IF NOT EXISTS "assignedToMemberId" UUID;

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "userId" UUID,
    "memberId" UUID,
    "kind" TEXT NOT NULL DEFAULT 'REMINDER',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceId" UUID,
    "dedupeKey" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "memberId" UUID;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "sourceId" UUID;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "createdBy" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_churchId_dedupeKey_key" ON "Notification" ("churchId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "Notification_churchId_scheduledFor_idx" ON "Notification" ("churchId", "scheduledFor");
