-- Hyttelageret, endring 2: hjemme/på hytta og holdbarhet.
-- Kjør hele filen én gang i Supabase: SQL Editor → New query → lim inn → Run.
-- Den tåler å kjøres flere ganger.

-- Holdbarhet per vare
alter table public.items add column if not exists shelf_days integer check (shelf_days is null or shelf_days > 0);
alter table public.items add column if not exists expires_on date;
alter table public.items add column if not exists stocked_at timestamptz;
update public.items set stocked_at = coalesce(bought_at, created_at) where stocked_at is null;
alter table public.items alter column stocked_at set default now();

-- Er vi på hytta eller hjemme? Én rad for hele hytta.
create table if not exists public.trip_state (
  id text primary key default 'main' check (id = 'main'),
  mode text not null default 'hjemme' check (mode in ('hjemme', 'hytta')),
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid() references auth.users (id) on delete set null,
  next_trip date
);
insert into public.trip_state (id, mode) values ('main', 'hjemme') on conflict (id) do nothing;

create or replace function public.touch_trip()
returns trigger
language plpgsql
as $$
begin
  new.changed_at := now();
  new.changed_by := coalesce(auth.uid(), new.changed_by);
  return new;
end;
$$;
drop trigger if exists trip_touch on public.trip_state;
create trigger trip_touch before update on public.trip_state for each row execute function public.touch_trip();

alter table public.trip_state enable row level security;
drop policy if exists members_all on public.trip_state;
create policy members_all on public.trip_state for all to authenticated using (public.is_member()) with check (public.is_member());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_state'
  ) then
    alter publication supabase_realtime add table public.trip_state;
  end if;
end $$;
