-- Hyttelageret: database og tilgangsregler.
-- Kjør hele filen én gang i Supabase: SQL Editor → New query → lim inn → Run.
-- Bytt ut de to e-postadressene nederst før du kjører.

-- Hvem som slipper inn. Bare disse adressene kan lese eller endre noe.
create table if not exists public.allowed_emails (
  email text primary key
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Varer i hytta
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  place text not null check (place in ('kjol', 'frys', 'torr', 'hus')),
  category text not null default 'annet',
  store text not null default 'krs',
  always boolean not null default true,
  status text not null default 'ok' check (status in ('ok', 'lite', 'tomt')),
  qty integer check (qty >= 0),
  frozen text,                      -- 'YYYY-MM' for frysevarer
  prev_status text,
  prev_qty integer,
  bought_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- Engangsting på handlelisten
create table if not exists public.extras (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  store text not null default 'krs',
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- Butikker
create table if not exists public.stores (
  id text primary key,
  name text not null,
  sort integer not null default 0
);

-- Siste avreisesjekk per skap
create table if not exists public.place_checks (
  place text primary key check (place in ('kjol', 'frys', 'torr', 'hus')),
  checked_at timestamptz not null default now(),
  checked_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- Visningsnavn
create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);

-- Oppdater updated_at og updated_by automatisk
create or replace function public.touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items for each row execute function public.touch();
drop trigger if exists extras_touch on public.extras;
create trigger extras_touch before update on public.extras for each row execute function public.touch();

-- Tilgangsregler: bare medlemmer, for alt
alter table public.allowed_emails enable row level security;
alter table public.items enable row level security;
alter table public.extras enable row level security;
alter table public.stores enable row level security;
alter table public.place_checks enable row level security;
alter table public.profiles enable row level security;

drop policy if exists members_all on public.items;
create policy members_all on public.items for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists members_all on public.extras;
create policy members_all on public.extras for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists members_all on public.stores;
create policy members_all on public.stores for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists members_all on public.place_checks;
create policy members_all on public.place_checks for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists members_read on public.profiles;
create policy members_read on public.profiles for select to authenticated using (public.is_member());
drop policy if exists own_write on public.profiles;
create policy own_write on public.profiles for all to authenticated using (public.is_member() and id = auth.uid()) with check (public.is_member() and id = auth.uid());
-- allowed_emails har ingen regler: ingen kan lese eller endre listen fra appen.

-- Sanntid: endringer sendes til åpne apper
do $$
declare t text;
begin
  foreach t in array array['items', 'extras', 'stores', 'place_checks', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Startdata
insert into public.stores (id, name, sort) values
  ('krs', 'Kristiansand', 0),
  ('bortelid', 'Bortelid', 1)
on conflict (id) do nothing;

-- BYTT UT disse to før du kjører:
insert into public.allowed_emails (email) values
  ('din-epost@eksempel.no'),
  ('christinas-epost@eksempel.no')
on conflict (email) do nothing;
