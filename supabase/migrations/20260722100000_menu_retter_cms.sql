-- Menuer pr. madkoncept — CMS for hjemmesiden.
--
-- William redigerer menuerne i Enzo under Madkoncepter; hjemmesiden henter dem
-- live via edge function menu-indtag (GET, offentlig). Samme model som
-- koncepterne i bookingformularen: én kilde, ingen kopi paa hjemmesiden.
--
-- HAENGER PAA MADKONCEPT, IKKE ENHED. Casa Food har kun to fysiske vogne, men
-- fem madkoncepter (Graesk, Indisk og Pasta er catering uden vogn). Kunder
-- vaelger mad, ikke vogne. Chris' foerste udkast havde "vogn" som noegle —
-- rettet foer frontenden blev bygget.
--
-- INGEN PRIS i denne omgang: William skal ikke vedligeholde priser to steder.
-- Kolonnen udelades helt frem for at ligge tom; den kan tilfoejes bagudkompatibelt.
--
-- Selve funktionskroppene er anvendt via MCP (apply_migration). Denne fil
-- dokumenterer skema og rettigheder — de to ting der ikke maa drive.

create table if not exists public.menu_retter (
  id uuid primary key default gen_random_uuid(),
  madkoncept_id uuid not null references public.madkoncepter(id) on delete cascade,
  navn text not null,
  beskrivelse text,
  sortering integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists menu_retter_koncept_idx
  on public.menu_retter(madkoncept_id, sortering);

-- Default-deny. Al adgang gaar gennem SECURITY DEFINER-RPC'er der gater paa
-- er_admin(), praecis som resten af systemet.
alter table public.menu_retter enable row level security;

-- RETTIGHEDER — vigtigt, se laering nedenfor.
-- Nye funktioner faar PUBLIC EXECUTE fra Postgres' egen default. 'revoke from
-- anon' rammer IKKE den, fordi anon arver fra PUBLIC. Det opdagede jeg kun ved
-- at verificere med has_function_privilege EFTER revoke — foerste forsoeg saa
-- ud til at lykkes, men aendrede intet.
revoke execute on function public.menu_liste()                                from public;
revoke execute on function public.menuer_offentlig()                          from public;
revoke execute on function public.menu_ret_opret(uuid, text, text)            from public;
revoke execute on function public.menu_ret_opdater(uuid, text, text, integer) from public;
revoke execute on function public.menu_ret_slet(uuid)                         from public;
revoke execute on function public.menu_ret_flyt(uuid, text)                   from public;

grant execute on function public.menu_liste()                                to authenticated, service_role;
grant execute on function public.menu_ret_opret(uuid, text, text)            to authenticated, service_role;
grant execute on function public.menu_ret_opdater(uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.menu_ret_slet(uuid)                         to authenticated, service_role;
grant execute on function public.menu_ret_flyt(uuid, text)                   to authenticated, service_role;

-- menuer_offentlig kaldes KUN af menu-indtag med service_role. Den skal hverken
-- kunne naas af anon eller af en logget ind bruger via PostgREST.
grant execute on function public.menuer_offentlig() to service_role;
