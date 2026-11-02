-- 11_bible_notes: the Bible panel keeps each person's own verse notes.
--
-- authorId is the signed-in account — a staff User id or a portal Member id —
-- so it is a plain uuid and not a foreign key: a note belongs to whoever wrote
-- it and no church page reads it. extras.sql finds the churchId column and puts
-- tenant isolation on the table, so a note is only ever visible inside its own
-- church.
CREATE TABLE IF NOT EXISTS "BibleNote" (
    "id" UUID NOT NULL,
    "churchId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "ref" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'yellow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BibleNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BibleNote_churchId_authorId_createdAt_idx" ON "BibleNote"("churchId", "authorId", "createdAt");
