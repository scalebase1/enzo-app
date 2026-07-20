-- Lås videnbase-bucketens storage-policies ned.
--
-- Reelt hul: policies videnbase_insert og videnbase_delete havde roller
-- {anon, authenticated} — dvs. enhver med den offentlige anon-nøgle kunne
-- UPLOADE og SLETTE filer i bucketen.
--
-- Desuden fandtes dublet-policies (to navnesæt for samme handlinger):
--   dansk (authenticated): videnbase skriv / slet / opdater / laes
--   engelsk (anon+auth):   videnbase_insert / _delete / _read
--
-- Efter denne migration:
--   INSERT/DELETE/UPDATE -> kun 'authenticated' (videnbase skriv/slet/opdater)
--   SELECT (listing)     -> ingen (objekt-URL'er virker uden; bucket er public)
--   anon                 -> ingen adgang
--
-- Verificeret mod enzo-app (Viden.jsx): appen bruger .upload()/.remove() som
-- authenticated og .getPublicUrl() (ren URL-bygger, kræver ingen SELECT-policy).
-- Ingen .list()-brug, så listing-policies kan fjernes uden at bryde appen.
--
-- Idempotent (drop ... if exists). De beholdte danske policies røres ikke.

-- Det reelle hul: anon skrive/slette
drop policy if exists "videnbase_insert" on storage.objects;
drop policy if exists "videnbase_delete" on storage.objects;

-- Dublet-SELECT + listing (begge fjernes; public objekt-URL'er virker uden)
drop policy if exists "videnbase_read" on storage.objects;
drop policy if exists "videnbase laes" on storage.objects;
