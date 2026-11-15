-- 17_outreach: the record of community outreach and evangelism outings, and the
-- people met there. A starter module, switched off until the office turns it on.
CREATE TABLE IF NOT EXISTS "OutreachActivity" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "dateKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EVANGELISM',
    "place" TEXT NOT NULL,
    "leaderName" TEXT,
    "peopleReached" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutreachActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OutreachActivity_churchId_dateKey_idx" ON "OutreachActivity" ("churchId", "dateKey");

CREATE TABLE IF NOT EXISTS "OutreachContact" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phoneE164" TEXT,
    "note" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OutreachContact_churchId_activityId_idx" ON "OutreachContact" ("churchId", "activityId");
ALTER TABLE "OutreachContact"
    ADD CONSTRAINT "OutreachContact_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "OutreachActivity"("id") ON DELETE CASCADE;