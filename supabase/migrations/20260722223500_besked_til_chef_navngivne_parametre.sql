-- RETTELSE 2: kaldet til koe_notifikation matchede ikke signaturen.
--
-- Signaturen er (p_channel text, p_recipient text, p_body text,
--                p_booking_id uuid, p_noegle text, p_subject text).
-- Jeg sendte staff_id som argument 5 — men det felt er p_noegle, en
-- DEDUPE-noegle mod paamindelse_log med "on conflict (noegle,dag) do nothing".
--
-- Havde typen tilfaeldigvis passet, var det blevet en langt vaerre fejl end en
-- fejlbesked: kun ÉN besked pr. chef pr. DAG ville sluppet igennem, og resten
-- ville forsvinde lydloest. En medarbejder der skrev to gange samme dag, ville
-- tro beskeden var sendt.
--
-- Nu kaldes den med NAVNGIVNE parametre. Positionelle kald mod en funktion med
-- seks argumenter og fire defaults er for skroebeligt.

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
  values (v_emne, 'direkte'::traad_type, now(), now())
  returning id into v_traad;

  insert into besked_deltagere(traad_id, staff_id) values (v_traad, p_chef_staff_id);
  insert into besked_deltagere(traad_id, staff_id) values (v_traad, v_mig);

  insert into beskeder(traad_id, afsender_staff_id, afsender_navn, tekst, oprettet_at)
  values (v_traad, v_mig, v_mit_navn, btrim(p_tekst), now())
  returning id into v_besked;

  insert into besked_status(besked_id, staff_id)
  values (v_besked, p_chef_staff_id);

  -- Chefen faar mail med det samme. Uden p_noegle: hver besked skal frem, ogsaa
  -- hvis den samme medarbejder skriver flere gange paa én dag.
  if coalesce(v_chef_mail,'') <> '' then
    perform koe_notifikation(
      p_channel   := 'email',
      p_recipient := v_chef_mail,
      p_body      := v_mit_navn||' har skrevet til dig i Enzo:'||chr(10)||chr(10)
                     ||btrim(p_tekst)||chr(10)||chr(10)
                     ||'Svar under Personalebeskeder.',
      p_subject   := 'Besked fra '||v_mit_navn);
  end if;

  return jsonb_build_object('ok',true,'traad_id',v_traad,'modtager',v_chef_navn,
    'besked','Sendt til '||v_chef_navn||'.');
end $function$;

revoke execute on function public.besked_til_chef(uuid, text, text) from public;
grant execute on function public.besked_til_chef(uuid, text, text) to authenticated, service_role;
