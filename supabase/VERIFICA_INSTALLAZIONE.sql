-- Libretto Volo - verifica non distruttiva della configurazione Supabase
-- Questo file esegue soltanto SELECT: non modifica e non cancella dati.

-- 1) Le tre tabelle devono esistere e rowsecurity deve essere true.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('flights', 'import_sessions', 'opening_balances')
order by tablename;

-- 2) Elenco delle policy RLS applicate.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('flights', 'import_sessions', 'opening_balances')
order by tablename, cmd, policyname;

-- 3) Valori predefiniti del saldo iniziale definiti nello schema.
select column_name, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'opening_balances'
  and column_name in (
    'total_minutes',
    'day_landings',
    'pic_minutes',
    'dual_minutes',
    'instructor_minutes'
  )
order by ordinal_position;

-- Valori attesi:
-- total_minutes = 47077      (784:37)
-- day_landings = 1455
-- pic_minutes = 40949        (682:29)
-- dual_minutes = 5529        (92:09)
-- instructor_minutes = 599   (9:59)

-- 4) Dopo la creazione dell'account qui deve comparire una riga per utente.
select user_id, total_minutes, day_landings, pic_minutes, dual_minutes,
       instructor_minutes, created_at, updated_at
from public.opening_balances
order by created_at;

-- 5) Conteggio dei dati presenti.
select
  (select count(*) from public.flights) as voli,
  (select count(*) from public.import_sessions) as importazioni,
  (select count(*) from public.opening_balances) as saldi_iniziali;
