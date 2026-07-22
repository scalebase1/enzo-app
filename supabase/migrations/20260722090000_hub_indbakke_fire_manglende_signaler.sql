-- hub_indbakke manglede fire signaler. Konsekvensen var at 30 ting der kraever
-- handling ikke var synlige noget sted i systemet:
--
--   4  afholdte vagter uden registrerede timer   -> folk faar ikke loen
--   2  afholdte driftsdage uden timer            -> samme, men paa vognene
--  17  ubemandede driftsdage frem i tiden        -> vognen aabner uden folk
--   6  forfaldne ubetalte fakturaer              -> penge der ikke kommer ind
--   1  lukket booking uden faktura               -> penge der aldrig faktureres
--
-- Dertil talte 'antal' hverken bemanding, timer eller fakturaer, selvom
-- booking_ubemandet allerede fandtes som post. Forsiden kunne derfor ikke
-- gruppere sine tal (Bemanding / Svar kunder / Timer / Fakturaer).
--
-- HASTIGHED — kalibreret, ikke gaettet. Foerste udgave satte timer og forfaldne
-- fakturaer til 'haster' uden taerskel og gav 11 roede ud af 20 poster: praecis
-- den stoej den forrige runde fjernede. Maalt paa live-data og rettet til:
--   timer:             >= 7 dage -> haster (loenkoersel er maanedlig)
--   faktura forfalden: >= 14 dage over forfald -> haster
--   faktura mangler:   >= 14 dage efter arrangementet -> haster
-- Resultat: 6 roede ud af 20, hver med en konkret begrundelse i 'hvorfor'.
--
-- BEVIDST BEGRAENSNING: ubemandede driftsdage vises kun som POSTER inden for 10
-- dage (samme vindue som ubemandede arrangementer). Alle 17 taelles i 'antal',
-- men en hel august-serie som poster ville drukne de vagter der mangler loen.

create or replace function public.hub_indbakke_hastighed_timer(p_dage integer)
returns text language sql immutable
set search_path = 'public'
as $$
  select case when p_dage >= 7 then 'haster' else 'snart' end
$$;

create or replace function public.hub_indbakke()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
set "TimeZone" to 'Europe/Copenhagen'
as $function$
begin
  if not public.er_admin() then return jsonb_build_object('ok',false,'fejl','Kun administrator.'); end if;

  return jsonb_build_object('ok',true,'poster', coalesce((
    select jsonb_agg(p order by
      case p->>'hastighed' when 'haster' then 0 when 'snart' then 1 else 2 end,
      (p->>'sorter')::numeric)
    from (

      -- UBESVAREDE HENVENDELSER: haster foerst efter 3 dage.
      select jsonb_build_object(
        'type','lead_ny','id', l.id,
        'titel', coalesce(nullif(l.navn,''), nullif(l.email,''), nullif(l.telefon,''), 'Henvendelse'),
        'undertekst', coalesce(nullif(public.afkort_pænt(l.besked,120),''), 'Ingen besked'),
        'dage', (current_date - l.sidste_aktivitet::date),
        'hastighed', case
          when (current_date - l.sidste_aktivitet::date) >= 3 then 'haster'
          else 'snart' end,
        'hvorfor', case
          when (current_date - l.sidste_aktivitet::date) >= 3
            then 'Kunden har ventet '||(current_date - l.sidste_aktivitet::date)||' dage på svar'
          else 'Nyt spørgsmål — svar inden for én hverdag' end,
        'sorter', -(current_date - l.sidste_aktivitet::date),
        'handling','Svar på henvendelsen','kilde', l.kilde) as p
      from leads l where l.status = 'ny' and l.booking_id is null

      union all

      -- DIALOGER DER ER GAAET I STAA
      select jsonb_build_object(
        'type','lead_kold','id', l.id,
        'titel', coalesce(nullif(l.navn,''), nullif(l.email,''), 'Henvendelse'),
        'undertekst', 'Ingen aktivitet i '||(current_date - l.sidste_aktivitet::date)||' dage',
        'dage', (current_date - l.sidste_aktivitet::date),
        'hastighed', case
          when (current_date - l.sidste_aktivitet::date) >= 14 then 'haster'
          when (current_date - l.sidste_aktivitet::date) >= 7 then 'snart'
          else 'normal' end,
        'hvorfor','Dialogen er gået i stå',
        'sorter', -(current_date - l.sidste_aktivitet::date),
        'handling','Følg op','kilde', l.kilde)
      from leads l
      where l.status in ('i_dialog','tilbud') and l.booking_id is null
        and (current_date - l.sidste_aktivitet::date) >= 5

      union all

      -- USENDTE KLADDER
      select jsonb_build_object(
        'type','kladde','id', k.id,
        'titel', coalesce(nullif(k.subject,''),'Kladde uden emne'),
        'undertekst', 'Til '||coalesce(nullif(k.recipient_email,''),'ukendt modtager'),
        'dage', (current_date - k.created_at::date),
        'hastighed', case
          when k.created_at < now() - interval '3 days' then 'haster'
          else 'snart' end,
        'hvorfor', case
          when k.created_at < now() - interval '3 days'
            then 'Har ligget klar i '||(current_date - k.created_at::date)||' dage'
          else 'Klar til gennemsyn' end,
        'sorter', -(current_date - k.created_at::date),
        'handling','Gennemse og send','kilde','kladde')
      from kladder k where k.status = 'klar'

      union all

      -- NYE BOOKINGER: hastigheden foelger hvor taet arrangementet er
      select jsonb_build_object(
        'type','booking_ny','id', b.id,
        'titel', coalesce(nullif(c.company,''), nullif(c.name,''), 'Ny booking'),
        'undertekst', to_char(b.event_date,'DD/MM YYYY')||' — '||coalesce(b.covers,0)||' kuverter'
                      || case when b.total_price is null or b.total_price = 0 then ' — mangler pris' else '' end,
        'dage', (b.event_date::date - current_date),
        'hastighed', case
          when (b.event_date::date - current_date) <= 7  then 'haster'
          when (b.event_date::date - current_date) <= 21 then 'snart'
          else 'normal' end,
        'hvorfor', case
          when (b.event_date::date - current_date) <= 7
            then 'Arrangementet er om '||(b.event_date::date - current_date)||' dage og er ikke bekræftet'
          when (b.event_date::date - current_date) <= 21
            then 'Om '||(b.event_date::date - current_date)||' dage'
          else 'God tid endnu' end,
        'sorter', (b.event_date::date - current_date),
        'handling','Godkend og prissæt','kilde','booking')
      from bookings b left join customers c on c.id=b.customer_id
      where b.status = 'ny' and b.event_date >= now()

      union all

      -- ARRANGEMENTER TAET PAA UDEN BEMANDING: den haardeste deadline der findes
      select jsonb_build_object(
        'type','booking_ubemandet','id', b.id,
        'titel', coalesce(nullif(c.company,''), nullif(c.name,''), 'Arrangement'),
        'undertekst', to_char(b.event_date,'DD/MM')||' — '||
                      coalesce(b.staff_confirmed,0)||' af '||coalesce(b.staff_required,0)||' bemandet',
        'dage', (b.event_date::date - current_date),
        'hastighed', case when (b.event_date::date - current_date) <= 3 then 'haster' else 'snart' end,
        'hvorfor','Mangler bemanding og afholdes om '||(b.event_date::date - current_date)||' dage',
        'sorter', (b.event_date::date - current_date),
        'handling','Bemand arrangementet','kilde','booking')
      from bookings b left join customers c on c.id=b.customer_id
      where b.status not in ('ny','afvist','aflyst','lukket')
        and b.event_date >= now() and (b.event_date::date - current_date) <= 10
        and coalesce(b.staff_required,0) > coalesce(b.staff_confirmed,0)

      union all

      -- NY: VOGNDAGE UDEN BEMANDING (kun inden for 10 dage, se hovedkommentaren)
      select jsonb_build_object(
        'type','driftsdag_ubemandet','id', d.id,
        'titel', e.navn,
        'undertekst', to_char(d.dato,'DD/MM')||' — '||to_char(d.aabner,'HH24:MI')||'–'||to_char(d.lukker,'HH24:MI'),
        'dage', (d.dato - current_date),
        'hastighed', case when (d.dato - current_date) <= 3 then 'haster' else 'snart' end,
        'hvorfor', case
          when d.dato = current_date then 'Vognen åbner i dag uden nogen på vagt'
          else 'Vognen åbner om '||(d.dato - current_date)||' dage uden nogen på vagt' end,
        'sorter', (d.dato - current_date),
        'handling','Sæt folk på vognen','kilde','vogndrift')
      from driftsdage d join enheder e on e.id = d.enhed_id
      where d.dato >= current_date and d.status <> 'aflyst'
        and (d.dato - current_date) <= 10
        and not exists (select 1 from drift_vagter dv where dv.driftsdag_id = d.id)

      union all

      -- NY: AFHOLDTE VAGTER UDEN TIMER — folk faar ikke loen foer de er registreret
      select jsonb_build_object(
        'type','timer_mangler_booking','id', s.booking_id,
        'titel', st.name,
        'undertekst', to_char(b.event_date,'DD/MM')||' — '||
                      coalesce(nullif(c.company,''), nullif(c.name,''),'arrangement'),
        'dage', (current_date - b.event_date::date),
        'hastighed', public.hub_indbakke_hastighed_timer((current_date - b.event_date::date)::int),
        'hvorfor', st.name||' arbejdede for '||(current_date - b.event_date::date)||
                   ' dage siden og mangler stadig timer',
        'sorter', -(current_date - b.event_date::date),
        'handling','Registrér timer','kilde','loen')
      from shifts s
      join bookings b on b.id = s.booking_id
      join staff st on st.id = s.staff_id
      left join customers c on c.id = b.customer_id
      where s.status in ('tildelt','bekraeftet')
        and b.event_date < now()
        and b.status <> 'aflyst'
        and not exists (
          select 1 from staff_hours sh
          where sh.booking_id = s.booking_id and sh.staff_id = s.staff_id)

      union all

      -- NY: AFHOLDTE VOGNDAGE UDEN TIMER
      select jsonb_build_object(
        'type','timer_mangler_drift','id', d.id,
        'titel', st.name,
        'undertekst', to_char(d.dato,'DD/MM')||' — '||e.navn,
        'dage', (current_date - d.dato),
        'hastighed', public.hub_indbakke_hastighed_timer((current_date - d.dato)::int),
        'hvorfor', st.name||' stod på '||e.navn||' d. '||to_char(d.dato,'DD/MM')||
                   ' og mangler stadig timer',
        'sorter', -(current_date - d.dato),
        'handling','Registrér timer','kilde','vogndrift')
      from drift_vagter dv
      join driftsdage d on d.id = dv.driftsdag_id
      join enheder e on e.id = d.enhed_id
      join staff st on st.id = dv.staff_id
      where d.dato < current_date and d.status <> 'aflyst'
        and not exists (
          select 1 from staff_hours sh
          where sh.driftsdag_id = d.id and sh.staff_id = dv.staff_id)

      union all

      -- NY: FORFALDNE UBETALTE FAKTURAER (netto 30 dage fra udstedelse)
      select jsonb_build_object(
        'type','faktura_forfalden','id', i.id,
        'titel', coalesce(i.invoice_number,'Faktura uden nummer'),
        'undertekst', coalesce(nullif(c.company,''), nullif(c.name,''),'Kunde')||' — '||
                      public.dansk_beloeb(i.amount),
        'dage', (current_date - (i.issued_at::date + 30)),
        'hastighed', case when (current_date - (i.issued_at::date + 30)) >= 14 then 'haster' else 'snart' end,
        'hvorfor', 'Forfaldt for '||(current_date - (i.issued_at::date + 30))||' dage siden og er ikke betalt',
        'sorter', -(current_date - (i.issued_at::date + 30)),
        'handling','Send betalingspåmindelse','kilde','faktura')
      from invoices i left join customers c on c.id = i.customer_id
      where i.status in ('udstedt','sendt')
        and i.issued_at is not null
        and i.issued_at::date + 30 < current_date

      union all

      -- NY: AFSLUTTEDE ARRANGEMENTER UDEN FAKTURA — omsaetning der aldrig faktureres
      select jsonb_build_object(
        'type','faktura_mangler','id', b.id,
        'titel', coalesce(nullif(c.company,''), nullif(c.name,''),'Kunde'),
        'undertekst', to_char(b.event_date,'DD/MM YYYY')||' — '||
                      coalesce(public.dansk_beloeb(b.total_price),'ingen pris'),
        'dage', (current_date - b.event_date::date),
        'hastighed', case when (current_date - b.event_date::date) >= 14 then 'haster' else 'snart' end,
        'hvorfor', 'Arrangementet blev afholdt for '||(current_date - b.event_date::date)||
                   ' dage siden og er ikke faktureret',
        'sorter', -(current_date - b.event_date::date),
        'handling','Opret faktura','kilde','faktura')
      from bookings b left join customers c on c.id = b.customer_id
      where b.status = 'lukket'
        and not exists (select 1 from invoices i where i.booking_id = b.id)

    ) q), '[]'::jsonb),

    -- 'antal' er forsidens grupperede tal: Bemanding · Svar kunder · Timer · Fakturaer.
    'antal', jsonb_build_object(
      'ubesvarede', (select count(*) from leads where status='ny' and booking_id is null),
      'kolde',      (select count(*) from leads where status in ('i_dialog','tilbud')
                       and booking_id is null and (current_date - sidste_aktivitet::date) >= 5),
      'kladder',    (select count(*) from kladder where status='klar'),
      'nye_bookinger', (select count(*) from bookings where status='ny' and event_date >= now()),

      -- Vogndage taelles for HELE horisonten (ikke kun 10 dage), saa tallet er sandt
      -- selvom kun de naere vises som poster.
      'bemanding', (
        (select count(*) from bookings b
          where b.status not in ('ny','afvist','aflyst','lukket')
            and b.event_date >= now() and (b.event_date::date - current_date) <= 10
            and coalesce(b.staff_required,0) > coalesce(b.staff_confirmed,0))
        +
        (select count(*) from driftsdage d
          where d.dato >= current_date and d.status <> 'aflyst'
            and not exists (select 1 from drift_vagter dv where dv.driftsdag_id = d.id))
      ),
      'timer', (
        (select count(*) from shifts s join bookings b on b.id = s.booking_id
          where s.status in ('tildelt','bekraeftet') and b.event_date < now() and b.status <> 'aflyst'
            and not exists (select 1 from staff_hours sh
                            where sh.booking_id = s.booking_id and sh.staff_id = s.staff_id))
        +
        (select count(*) from drift_vagter dv join driftsdage d on d.id = dv.driftsdag_id
          where d.dato < current_date and d.status <> 'aflyst'
            and not exists (select 1 from staff_hours sh
                            where sh.driftsdag_id = d.id and sh.staff_id = dv.staff_id))
      ),
      'fakturaer', (
        (select count(*) from invoices
          where status in ('udstedt','sendt') and issued_at is not null
            and issued_at::date + 30 < current_date)
        +
        (select count(*) from bookings b
          where b.status = 'lukket'
            and not exists (select 1 from invoices i where i.booking_id = b.id))
      ),
      'svar_kunder', (
        (select count(*) from leads where status='ny' and booking_id is null)
        + (select count(*) from kladder where status='klar')
      )
    ));
end $function$;
