-- ============================================================
-- CargoNepal — Migration 0001: Extensions
-- ============================================================
-- Enables the extensions the platform relies on.
--   * pgcrypto   -> gen_random_uuid(), cryptographic hashing
--   * citext     -> case-insensitive email/username storage
--   * btree_gist -> exclusion/index support for geo + range queries
--   * postgis    -> OPTIONAL. Enables true geographic distance
--                   queries. If your Supabase project does not have
--                   PostGIS enabled, the platform falls back to the
--                   haversine SQL function defined in 0007.
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "btree_gist";

-- PostGIS is optional but recommended for production geo queries.
-- Run `create extension postgis;` in the Supabase SQL editor if available.
do $$
begin
  create extension if not exists "postgis";
exception when others then
  raise notice 'PostGIS not available; using haversine fallback for distance queries.';
end $$;
