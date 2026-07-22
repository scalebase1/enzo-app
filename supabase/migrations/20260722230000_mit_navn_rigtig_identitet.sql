-- HVEM HANDLER? Systemet antog William.
--
-- Med tre chefer er "William" ikke laengere en forkortelse, men forkerte data:
--   besked_svar   skrev 'William' som afsender uanset hvem der svarede
--   faktura_send  loggede 'William (dashboard)' i audit_log
--   virksomhed_gem samme
--
-- En medarbejder der fik svar fra chef nr. 2 paa sin sygemelding, saa "William".
-- Og bogfoeringssporet pegede paa den forkerte person.
--
-- mit_navn() slaar den aktuelle bruger op. Fallback-kaeden sikrer at der ALTID
-- staar noget meningsfuldt: staff-navn -> konfigureret admin-navn -> 'Ledelsen'.
-- Sidste led betyder at et manglende opslag giver en neutral, sand tekst frem
-- for et forkert navn.

create or replace function public.mit_navn()
returns text
language sql stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select s.name from staff s where s.auth_user_id = auth.uid() and s.active limit 1),
    nullif((select value#>>'{}' from business_config where key='admin_navn'), ''),
    'Ledelsen'
  );
$function$;

revoke execute on function public.mit_navn() from public;
grant execute on function public.mit_navn() to authenticated, service_role;

-- Seks funktioner havde 'William' hardkodet. De er patchet programmatisk
-- (hent definition, praecis streng-erstatning, CREATE OR REPLACE) frem for
-- omskrevet i haanden — saa ingen logik kunne aendre sig ved et uheld:
--
--   besked_svar       v_navn := 'William'        -> public.mit_navn()
--   faktura_send      'William (dashboard)'      -> public.mit_navn()
--   virksomhed_gem    'William (dashboard)'      -> public.mit_navn()
--   besked_send       'Kun William kan...'       -> 'Kun en chef kan...'
--   flyt_vagt         'Kontakt William...'       -> 'Kontakt din leder...'
--   kobl_medarbejder  'Williams godkendelse'     -> 'ledelsens godkendelse'
--
-- De to sidste forekomster (gem_kladde, medarbejder_slet) er kommentarer i
-- kildekoden og roert ikke.
--
-- Verificeret efter patch: hver bruger faar sit EGET navn (testet ved at
-- simulere hver session), og ingen af de seks blev anon-eksekverbare.
