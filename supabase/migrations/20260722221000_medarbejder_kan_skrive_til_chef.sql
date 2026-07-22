-- MEDARBEJDERE KAN NU SKRIVE TIL LEDELSEN.
--
-- Foer: besked_send var admin-only ("Kun William kan sende beskeder herfra").
-- En medarbejder kunne kun SVARE paa en traad, aldrig starte en. Sygemelding
-- eller anmodning om fri kunne derfor ikke sendes gennem systemet.
--
-- Ny funktion frem for at loesne besked_send: de to veje har forskellige regler.
-- En chef vaelger frit blandt alle medarbejdere; en medarbejder maa KUN skrive
-- til chefer — ellers kunne han skrive til kolleger, og det er et andet produkt
-- med andre privatlivsregler.
--
-- Medarbejderen vaelger hvilken chef. Casa Food har tre, fordelt paa
-- koncepterne, saa "skriv til ledelsen" som én kanal ville sende sygemeldinger
-- til folk det ikke vedkommer.

create or replace function public.besked_til_chef(
  p_chef_staff_id uuid,
  p_tekst text,
  p_emne text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'net', 'extensions'
set "TimeZone" to 'Europe/Copenhagen'
as $function$
declare
  v_mig uuid; v_mit_navn text;
  v_chef_navn text; v_chef_mail text;
  v_traad uuid; v_besked uuid; v_emne text;
begin
  v_mig := public.aktuel_medarbejder();
  if v_mig is null then
    return jsonb_build_object('ok',false,'fejl','Kun en aktiv medarbejder kan skrive til ledelsen.');
  end if;

  if coalesce(btrim(p_tekst),'') = '' then
    return jsonb_build_object('ok',false,'fejl','Beskeden er tom.');
  end if;

  select name into v_mit_navn from staff where id = v_mig;

  select s.name, s.email into v_chef_navn, v_chef_mail
  from staff s
  where s.id = p_chef_staff_id and s.rolle = 'chef' and s.active;

  if v_chef_navn is null then
    return jsonb_build_object('ok',false,'fejl','Vælg hvem beskeden skal sendes til.');
  end if;

  v_emne := coalesce(nullif(btrim(p_emne),''), 'Besked fra '||v_mit_navn);

  insert into besked_traade(emne, type, oprettet_at, sidste_aktivitet)
  values (v_emne, 'medarbejder', now(), now())
  returning id into v_traad;

  -- BEGGE parter paa traaden: chefen skal kunne se den, og medarbejderen skal
  -- kunne foelge sin egen. besked_traade_liste filtrerer paa deltagelse.
  insert into besked_deltagere(traad_id, staff_id) values (v_traad, p_chef_staff_id);
  insert into besked_deltagere(traad_id, staff_id) values (v_traad, v_mig);

  insert into beskeder(traad_id, afsender_staff_id, afsender_navn, tekst, oprettet_at)
  values (v_traad, v_mig, v_mit_navn, btrim(p_tekst), now())
  returning id into v_besked;

  insert into besked_status(besked_id, staff_id)
  values (v_besked, p_chef_staff_id);

  -- Chefen faar besked paa mail. Uden det ville en sygemelding kunne ligge
  -- ulaest til naeste gang han aabner systemet.
  if coalesce(v_chef_mail,'') <> '' then
    perform koe_notifikation(
      'email', v_chef_mail,
      v_mit_navn||' har skrevet til dig i Enzo:'||chr(10)||chr(10)||btrim(p_tekst)
        ||chr(10)||chr(10)||'Svar under Personalebeskeder.',
      null, p_chef_staff_id,
      'Besked fra '||v_mit_navn);
  end if;

  return jsonb_build_object('ok',true,'traad_id',v_traad,'modtager',v_chef_navn,
    'besked','Sendt til '||v_chef_navn||'.');
end $function$;

revoke execute on function public.besked_til_chef(uuid, text, text) from public;
grant execute on function public.besked_til_chef(uuid, text, text) to authenticated, service_role;
