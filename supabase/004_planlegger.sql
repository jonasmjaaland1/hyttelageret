-- Hyttelageret, endring 4: Planleggeren.
-- Kjør hele filen i Supabase: SQL Editor → New query → lim inn → Run. Den tåler å kjøres flere ganger.

-- Engangsting på handlelisten får kategori (for butikkrekkefølgen) og et notat (mengde og rett).
alter table public.extras add column if not exists category text;
alter table public.extras add column if not exists note text;

-- Den gjeldende menyplanen. Én rad.
create table if not exists public.plans (
  id text primary key default 'current' check (id = 'current'),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.touch();

alter table public.plans enable row level security;
drop policy if exists members_all on public.plans;
create policy members_all on public.plans for all to authenticated using (public.is_member()) with check (public.is_member());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plans'
  ) then
    alter publication supabase_realtime add table public.plans;
  end if;
end $$;
