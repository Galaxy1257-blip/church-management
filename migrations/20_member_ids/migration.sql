-- 20_member_ids: stable church-specific prefixes and a durable, race-free
-- allocator. Existing member numbers are never rewritten.

CREATE OR REPLACE FUNCTION chms_member_prefix(church_name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  normalized text;
  words text[];
  meaningful text[] := ARRAY[]::text[];
  word text;
  result text := '';
BEGIN
  normalized := upper(coalesce(church_name, ''));
  normalized := replace(normalized, 'Æ', 'AE');
  normalized := replace(normalized, 'Œ', 'OE');
  normalized := replace(normalized, 'Ø', 'O');
  normalized := replace(normalized, 'Đ', 'D');
  normalized := replace(normalized, 'Ð', 'D');
  normalized := replace(normalized, 'Ł', 'L');
  normalized := replace(normalized, 'Þ', 'TH');
  normalized := replace(normalized, 'ß', 'SS');
  normalized := normalize(normalized, NFD);
  normalized := regexp_replace(normalized, U&'[\0300-\036F]', '', 'g');
  words := regexp_split_to_array(normalized, '[^A-Z0-9]+');

  FOREACH word IN ARRAY words LOOP
    IF word <> '' AND NOT (word = ANY (ARRAY[
      'THE', 'OF', 'AND', 'CHURCH', 'MINISTRY', 'MINISTRIES', 'INTERNATIONAL',
      'ASSEMBLIES', 'FELLOWSHIP', 'CHRISTIAN', 'CENTRE', 'CENTER'
    ])) THEN
      meaningful := array_append(meaningful, word);
    END IF;
  END LOOP;

  IF cardinality(meaningful) >= 2 THEN
    FOREACH word IN ARRAY meaningful LOOP
      result := result || substr(word, 1, 1);
      IF length(result) >= 4 THEN EXIT; END IF;
    END LOOP;
  ELSE
    result := substr(coalesce(meaningful[1], array_to_string(words, '')), 1, 4);
  END IF;

  IF length(result) < 2 THEN
    result := '';
    FOREACH word IN ARRAY words LOOP
      IF word <> '' THEN
        result := result || substr(word, 1, 1);
        IF length(result) >= 2 THEN EXIT; END IF;
      END IF;
    END LOOP;
  END IF;
  result := regexp_replace(result, '[^A-Z0-9]', '', 'g');
  RETURN CASE WHEN result ~ '^[A-Z0-9]{2,4}$' THEN result ELSE 'CH' END;
END $$;

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "memberIdPrefix" TEXT;

CREATE TABLE IF NOT EXISTS "MemberNumberCounter" (
  "churchId" UUID PRIMARY KEY,
  "prefix" TEXT NOT NULL CHECK ("prefix" ~ '^[A-Z0-9]{2,4}$'),
  "nextNumber" INTEGER NOT NULL DEFAULT 1 CHECK ("nextNumber" >= 1)
);

UPDATE "Church"
SET "memberIdPrefix" = chms_member_prefix(name)
WHERE "memberIdPrefix" IS NULL;

INSERT INTO "MemberNumberCounter" ("churchId", "prefix", "nextNumber")
SELECT
  c.id,
  c."memberIdPrefix",
  COALESCE((
    SELECT MAX(CAST(SUBSTRING(m."memberNo" FROM char_length(c."memberIdPrefix") + 2) AS INTEGER))
    FROM "Member" m
    WHERE m."churchId" = c.id
      AND m."memberNo" ~* ('^' || c."memberIdPrefix" || '-[0-9]+$')
  ), 0) + 1
FROM "Church" c
WHERE c."memberIdPrefix" IS NOT NULL
ON CONFLICT ("churchId") DO NOTHING;

ALTER TABLE "MemberNumberCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberNumberCounter" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MemberNumberCounter";
CREATE POLICY tenant_isolation ON "MemberNumberCounter"
    USING ("churchId"::text = (SELECT current_setting('app.church_id', true)));
