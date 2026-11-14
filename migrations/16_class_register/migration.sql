-- 16_class_register: a Sunday-by-Sunday attendance register for the class the
-- office assigned to a Sunday School teacher, plus the health note a parent
-- gives the class ("peanut allergy"), readable only by the office and that
-- teacher. The register is keyed by a church-local date so it works even when
-- the Services section is switched off and no Service row exists.
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "allergyNote" TEXT;

CREATE TABLE IF NOT EXISTS "ClassRegisterMark" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "dateKey" TEXT NOT NULL,
    "childId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "markedBy" UUID NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassRegisterMark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassRegisterMark_churchId_dateKey_childId_key"
    ON "ClassRegisterMark" ("churchId", "dateKey", "childId");
CREATE INDEX IF NOT EXISTS "ClassRegisterMark_churchId_dateKey_idx"
    ON "ClassRegisterMark" ("churchId", "dateKey");
