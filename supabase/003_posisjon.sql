-- Hyttelageret, endring 3: hyttas posisjon, så appen kan foreslå «Vi er på hytta» og «Vi drar».
-- Kjør hele filen i Supabase: SQL Editor → New query → lim inn → Run. Den tåler å kjøres flere ganger.

alter table public.trip_state add column if not exists cabin_lat double precision;
alter table public.trip_state add column if not exists cabin_lng double precision;
