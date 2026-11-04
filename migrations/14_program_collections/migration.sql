-- 14_program_collections: money is counted at other programs too (harvest
-- night, a funeral, a building-fund drive), so a counting batch no longer has to
-- point at a Sunday service; its label names the occasion.
ALTER TABLE "GivingBatch" ALTER COLUMN "serviceId" DROP NOT NULL;
