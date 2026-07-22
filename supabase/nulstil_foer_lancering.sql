-- ============================================================
-- NULSTILLING FØR LANCERING — Casa Food / Enzo
-- ============================================================
-- Aftalt 16-07-2026: "Alle kunder og medarbejdere er testdata. Tøm alt — helt
-- ren start." Køres FØRST når Christopher siger "vi lancerer".
--
-- KØRES ÉN GANG. Der er ingen fortrydelsesknap.
--
-- HVAD DER SLETTES: alle kunder, bookinger, leads, fakturaer, medarbejdere,
-- vagter, timer, driftsdage, kladder, beskeder, notifikationer, Enzos
-- samtalehistorik og forslag, videnbase, audit-log.
--
-- HVAD DER BEVARES — og hvorfor:
--   business_config   virksomhedsoplysninger, moms, betalingsfrist, kapacitet
--   enheder           Casa Food Catering, Casanova, The Blue Pearl
--   madkoncepter      de fem koncepter bookingformularen viser
--   menu_retter       menuerne hjemmesiden henter
--   auth.users        Williams login. Slettes IKKE — han skal kunne logge ind
--                     bagefter. Testmedarbejderes logins ryddes separat, se sidst.
--
-- RÆKKEFØLGE: børn før forældre. Fremmednøgler ville ellers blokere.
-- ============================================================

begin;

-- ---------- Enzo ----------
delete from enzo_forslag;
delete from enzo_samtale_titler;
delete from n8n_chat_histories;

-- ---------- Kommunikation ----------
delete from besked_status;
delete from besked_deltagere;
delete from beskeder;
delete from besked_traade;
delete from kladder;
delete from notifications;
delete from conversations;
delete from campaigns;
delete from paamindelse_log;

-- ---------- Arbejde og løn ----------
delete from staff_hours;
delete from shifts;
delete from drift_vagter;
delete from driftsdage;
delete from availability;

-- ---------- Penge ----------
delete from invoices;
-- Fakturanummer nulstilles, så William starter på 2026-0001 frem for 2026-0016.
delete from invoice_counter;

-- ---------- Salg ----------
delete from booking_madkoncepter;
delete from shopping_lists;
delete from bookings;
delete from leads;
delete from customers;

-- ---------- Personale ----------
-- Bemærk: staff slettes helt. Williams egen bruger ligger i auth.users og
-- business_config.admin_auth_id, ikke i staff.
delete from staff;

-- ---------- Øvrigt ----------
delete from videnbase;
delete from audit_log;

-- ---------- Oprydning i konfiguration ----------
-- Rest fra en test 16-07.
delete from business_config where key = '_test_noop';
-- Telegram blev taget ud af systemet 16-07; bot-brugernavnet er dødt.
delete from business_config where key = 'enzo_bot_username';

-- ============================================================
-- KONTROL — skal vise 0 overalt, og bevaret-tallene skal stemme
-- ============================================================
select 'kunder' as tabel, count(*) from customers
union all select 'bookinger', count(*) from bookings
union all select 'leads', count(*) from leads
union all select 'fakturaer', count(*) from invoices
union all select 'medarbejdere', count(*) from staff
union all select 'vagter', count(*) from shifts
union all select 'timer', count(*) from staff_hours
union all select 'driftsdage', count(*) from driftsdage
union all select 'kladder', count(*) from kladder
union all select 'notifikationer', count(*) from notifications
union all select 'enzo-forslag', count(*) from enzo_forslag
union all select 'enzo-samtaler', count(*) from n8n_chat_histories
union all select 'videnbase', count(*) from videnbase
union all select '--- BEVARET ---', null
union all select 'enheder (skal være 3)', count(*) from enheder
union all select 'madkoncepter (skal være 6)', count(*) from madkoncepter
union all select 'menu-retter', count(*) from menu_retter
union all select 'config (skal være 13)', count(*) from business_config
order by 1;

-- Alt ser rigtigt ud? Så:
commit;
-- Noget ser forkert ud? Så:
-- rollback;
