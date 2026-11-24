-- 21_scheduled_announcements: durable per-channel delivery for announcements.
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AnnouncementDelivery" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnnouncementDelivery_announcementId_channel_key" UNIQUE ("announcementId", "channel"),
    CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AnnouncementDelivery_churchId_status_dueAt_idx"
    ON "AnnouncementDelivery" ("churchId", "status", "dueAt");

ALTER TABLE "AnnouncementDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementDelivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AnnouncementDelivery";
CREATE POLICY tenant_isolation ON "AnnouncementDelivery"
    USING ("churchId"::text = (SELECT current_setting('app.church_id', true)));
