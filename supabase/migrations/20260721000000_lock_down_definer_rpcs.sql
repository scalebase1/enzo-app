-- Lås SECURITY DEFINER-RPC'er ned: fjern PUBLIC/anon-EXECUTE.
--
-- Baggrund: alle disse funktioner var eksekverbare af anon via en løs PUBLIC-grant
-- (proacl '=X/postgres'). 20 af dem afviser anon internt (er_admin() / min_staff_id()
-- / enzo_rolle()='ukendt'), men grantet var alligevel åbent. notify_watchdog()
-- manglede HELT en intern guard og blev hotfixet i produktion (revoke public, anon);
-- det gentages her, så friske miljøer/DB'er får samme tilstand. Alle statements er
-- idempotente.
--
-- Rollemodel efter denne migration:
--   authenticated  -> kaldes fra klienten bag login (admin = William, medarbejder)
--   service_role   -> edge functions / n8n / server
--   (intern/cron)  -> kun ejer (postgres); ingen klientrolle
--
-- Verificeret mod enzo-app-klientkoden (supabase.rpc(...)):
--   - De 18 i blok 1 kaldes alle fra sektioner bag login (authenticated).
--     faktura_marker_sendt_manuelt + marker_kladde_sendt optræder ikke i den
--     nuværende klientkode, men er er_admin-gated admin-handlinger — beholdes på
--     authenticated. Fjern dem fra grant-listen hvis de skal være rent interne.
--   - hent_kontekst: kaldes ikke fra klienten (server/edge/n8n) -> kun service_role.
--   - min_staff_id: kaldes ikke fra klienten; kun internt af besked_*-funktioner
--     (som kører som definer=postgres) -> ingen klientrolle.
--   - notify_watchdog: kun pg_cron (kører som postgres, dagligt 07:00).
--
-- Supabase kører migrationen i sin egen transaktion; ingen eksplicit begin/commit.

-- 1) Klient-kaldte admin/medarbejder-RPC'er: authenticated + service_role
revoke execute on function
  public.faktura_send(uuid),
  public.faktura_tekst(uuid),
  public.faktura_marker_sendt_manuelt(uuid, boolean),
  public.marker_kladde_sendt(uuid, boolean),
  public.virksomhed_gem(jsonb),
  public.virksomhed_hent(),
  public.medarbejdere_liste(),
  public.besked_send(uuid[], text, text, jsonb, uuid),
  public.besked_svar(uuid, text),
  public.besked_handling_udfoer(uuid),
  public.besked_marker_laest(uuid),
  public.besked_traad_hent(uuid),
  public.besked_traade_liste(),
  public.beregn_daekningsbidrag(uuid),
  public.booking_saet_vareomkostning(uuid, numeric),
  public.indkoeb_forslag(uuid),
  public.indkoeb_gem(uuid, jsonb, boolean),
  public.indkoeb_hent(uuid)
from public, anon;

grant execute on function
  public.faktura_send(uuid),
  public.faktura_tekst(uuid),
  public.faktura_marker_sendt_manuelt(uuid, boolean),
  public.marker_kladde_sendt(uuid, boolean),
  public.virksomhed_gem(jsonb),
  public.virksomhed_hent(),
  public.medarbejdere_liste(),
  public.besked_send(uuid[], text, text, jsonb, uuid),
  public.besked_svar(uuid, text),
  public.besked_handling_udfoer(uuid),
  public.besked_marker_laest(uuid),
  public.besked_traad_hent(uuid),
  public.besked_traade_liste(),
  public.beregn_daekningsbidrag(uuid),
  public.booking_saet_vareomkostning(uuid, numeric),
  public.indkoeb_forslag(uuid),
  public.indkoeb_gem(uuid, jsonb, boolean),
  public.indkoeb_hent(uuid)
to authenticated, service_role;

-- 2) Kun server/edge (ikke klient): service_role
revoke execute on function public.hent_kontekst(text) from public, anon, authenticated;
grant  execute on function public.hent_kontekst(text) to service_role;

-- 3) Kun intern + cron: ingen klientrolle (ejer postgres beholder execute)
revoke execute on function public.min_staff_id()    from public, anon, authenticated;
revoke execute on function public.notify_watchdog() from public, anon, authenticated;
grant  execute on function public.notify_watchdog() to service_role; -- evt. edge-trigger; cron kører som postgres uanset
