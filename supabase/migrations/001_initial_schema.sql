-- Libretto Volo - schema iniziale Supabase
-- Eseguire nel SQL Editor di Supabase una sola volta.

create extension if not exists pgcrypto;

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flight_date date not null,
  departure_place text not null,
  departure_time time without time zone not null,
  arrival_place text not null,
  arrival_time time without time zone not null,
  aircraft_model text not null default '',
  registration text not null,
  single_engine boolean not null default true,
  multi_engine_minutes integer not null default 0 check (multi_engine_minutes >= 0),
  pilot_name text not null default '',
  day_landings integer not null default 0 check (day_landings >= 0),
  night_landings integer not null default 0 check (night_landings >= 0),
  night_minutes integer not null default 0 check (night_minutes >= 0),
  ifr_minutes integer not null default 0 check (ifr_minutes >= 0),
  pic_minutes integer not null default 0 check (pic_minutes >= 0),
  copilot_minutes integer not null default 0 check (copilot_minutes >= 0),
  dual_minutes integer not null default 0 check (dual_minutes >= 0),
  instructor_minutes integer not null default 0 check (instructor_minutes >= 0),
  simulator_date date,
  simulator_type text not null default '',
  simulator_minutes integer not null default 0 check (simulator_minutes >= 0),
  remarks text not null default '',
  duplicate_key text not null,
  source_file text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint flights_user_duplicate_unique unique (user_id, duplicate_key)
);

create table if not exists public.import_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imported_at timestamptz not null default now(),
  file_name text not null,
  found_count integer not null default 0 check (found_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  duplicate_details text not null default ''
);

-- Un solo saldo iniziale per utente. Questi valori non sono voli e non
-- aumentano il numero dei record dell'archivio voli.
create table if not exists public.opening_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_minutes integer not null default 47077 check (total_minutes >= 0),
  day_landings integer not null default 1455 check (day_landings >= 0),
  pic_minutes integer not null default 40949 check (pic_minutes >= 0),
  dual_minutes integer not null default 5529 check (dual_minutes >= 0),
  instructor_minutes integer not null default 599 check (instructor_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flights_user_date_idx on public.flights (user_id, flight_date desc, departure_time desc);
create index if not exists flights_user_updated_idx on public.flights (user_id, updated_at);
create index if not exists imports_user_date_idx on public.import_sessions (user_id, imported_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flights_set_updated_at on public.flights;
create trigger flights_set_updated_at
before update on public.flights
for each row execute function public.set_updated_at();

drop trigger if exists opening_balances_set_updated_at on public.opening_balances;
create trigger opening_balances_set_updated_at
before update on public.opening_balances
for each row execute function public.set_updated_at();

create or replace function public.create_default_opening_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.opening_balances (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_opening_balance on auth.users;
create trigger on_auth_user_created_opening_balance
after insert on auth.users
for each row execute function public.create_default_opening_balance();

-- Crea il saldo anche per gli account eventualmente gia presenti.
insert into public.opening_balances (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.flights enable row level security;
alter table public.import_sessions enable row level security;
alter table public.opening_balances enable row level security;

revoke all on table public.flights from anon, authenticated;
revoke all on table public.import_sessions from anon, authenticated;
revoke all on table public.opening_balances from anon, authenticated;
grant select, insert, update, delete on table public.flights to authenticated;
grant select, insert, update, delete on table public.import_sessions to authenticated;
grant select, insert, update on table public.opening_balances to authenticated;

-- Politiche separate per operazione: ogni utente vede e modifica solo i propri record.
drop policy if exists "flights_select_own" on public.flights;
create policy "flights_select_own"
on public.flights for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "flights_insert_own" on public.flights;
create policy "flights_insert_own"
on public.flights for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "flights_update_own" on public.flights;
create policy "flights_update_own"
on public.flights for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "flights_delete_own" on public.flights;
create policy "flights_delete_own"
on public.flights for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "imports_select_own" on public.import_sessions;
create policy "imports_select_own"
on public.import_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "imports_insert_own" on public.import_sessions;
create policy "imports_insert_own"
on public.import_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "imports_update_own" on public.import_sessions;
create policy "imports_update_own"
on public.import_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "imports_delete_own" on public.import_sessions;
create policy "imports_delete_own"
on public.import_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "opening_balances_select_own" on public.opening_balances;
create policy "opening_balances_select_own"
on public.opening_balances for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "opening_balances_insert_own" on public.opening_balances;
create policy "opening_balances_insert_own"
on public.opening_balances for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "opening_balances_update_own" on public.opening_balances;
create policy "opening_balances_update_own"
on public.opening_balances for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
