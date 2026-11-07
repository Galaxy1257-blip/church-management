-- 15_programs: church programs (celebrations/milestones) that repeat on a
-- member's date — a birthday, wedding anniversary, salvation/baptism day.
-- Leaders see whose milestone is coming within remindDays on the Programs
-- screen; approving one pushes a whole-church notification to the companion.
CREATE TABLE IF NOT EXISTS "Program" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dateField" TEXT NOT NULL DEFAULT 'DOB',
    "remindDays" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Program_churchId_idx" ON "Program" ("churchId");
