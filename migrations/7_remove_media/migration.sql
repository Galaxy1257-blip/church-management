-- 7_remove_media: the Media section is gone (page, sermon library, songs and
-- projection setlists). Drop its table, strip the two permissions from stored
-- role presets, and remove the song/setlist lists from church settings.
DROP TABLE IF EXISTS "MediaItem";

UPDATE "Role"
SET permissions = array_remove(array_remove(permissions, 'media:read'), 'media:write');

UPDATE "Church"
SET settings = settings - 'songs' - 'setlists'
WHERE settings ?| ARRAY['songs', 'setlists'];
