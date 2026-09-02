-- Aggiornamento v1.0.1 - saldo iniziale persistente nel database
-- Eseguire dopo 001_initial_schema.sql soltanto sui progetti creati con v1.0.0.

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

insert into public.opening_balances (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.opening_balances enable row level security;
revoke all on table public.opening_balances from anon, authenticated;
grant select, insert, update on table public.opening_balances to authenticated;

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
