-- HVEM GJORDE HVAD — synligt for tre chefer.
--
-- audit_log har eksisteret hele tiden, men to ting gjorde den ubrugelig:
--   1. actor_navn var NULL paa naesten alt. Kun faktura_send og virksomhed_gem
--      satte den, og de skrev 'William (dashboard)' uanset hvem.
--   2. Den blev aldrig vist noget sted.
--
-- 27 funktioner skriver til audit_log. I stedet for at patche dem alle — og
-- huske det hver gang der kommer en ny — udfyldes actor_navn af en TRIGGER.
--
-- Bevidst UDEN fallback til 'Ledelsen': er auth.uid() null, er handlingen udfoert
-- af cron eller en edge function, og saa skal der staa 'Systemet', ikke et
-- menneskenavn. Et forkert navn i et revisionsspor er vaerre end intet navn.

create or replace function public.trg_audit_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.actor_navn is null and auth.uid() is not null then
    select s.name into new.actor_navn
    from staff s where s.auth_user_id = auth.uid() and s.active limit 1;
  end if;
  return new;
end $function$;

drop trigger if exists audit_actor_udfyld on public.audit_log;
create trigger audit_actor_udfyld
  before insert on public.audit_log
  for each row execute function public.trg_audit_actor();

-- Aktivitetsstribe: hvad er der sket, formuleret som en saetning et menneske
-- kan skimme. Ikke raa handlingsnavne som 'booking_godkend'.
create or replace function public.aktivitet_liste(p_antal integer default 12)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
set "TimeZone" to 'Europe/Copenhagen'
as $function$
begin
  if not public.er_admin() then
    return jsonb_build_object('ok',false,'fejl','Kun en chef kan se aktiviteten.');
  end if;

  -- Subquery med order by + limit, og aggregering UDENOM. jsonb_agg(... order by)
  -- kan ikke kombineres med order by/limit paa samme niveau.
  return jsonb_build_object('ok', true, 'poster', coalesce((
    select jsonb_agg(x.p order by x.hvornaar desc)
    from (
      select a.created_at as hvornaar, jsonb_build_object(
        'id', a.id,
        'hvem', coalesce(a.actor_navn, case when a.performed_by = 'system' then 'Systemet' else 'Ukendt' end),
        'er_system', a.performed_by = 'system',
        'hvad', case a.action
          when 'booking_godkend'      then 'godkendte en booking'
          when 'booking_afvis'        then 'afviste en booking'
          when 'opdater_booking'      then 'rettede en booking'
          when 'faktura_send'         then 'sendte en faktura'
          when 'faktura_slet'         then 'slettede en fakturakladde'
          when 'faktura_opret'        then 'oprettede en faktura'
          when 'faktura_udsted'       then 'udstedte en faktura'
          when 'registrer_timer'      then 'registrerede timer'
          when 'tilfoej_medarbejder'  then 'oprettede en medarbejder'
          when 'opdater_medarbejder'  then 'rettede en medarbejder'
          when 'medarbejder_slet'     then 'fjernede en medarbejder'
          when 'fjern_medarbejder'    then 'fjernede en medarbejder'
          when 'godkend_medarbejder'  then 'godkendte en medarbejder'
          when 'kobl_medarbejder'     then 'koblede sig til systemet'
          when 'opdater_loen_medarbejder' then 'ændrede en timeløn'
          when 'opdater_kunde'        then 'rettede en kunde'
          when 'gem_kladde'           then 'gemte et udkast'
          when 'kladde_opdater'       then 'rettede et udkast'
          when 'kladde_slet'          then 'slettede et udkast'
          when 'besked_send'          then 'sendte en personalebesked'
          when 'flyt_vagt'            then 'flyttede en vagt'
          when 'virksomhed_gem'       then 'ændrede virksomhedsoplysninger'
          else replace(a.action, '_', ' ')
        end,
        -- Hvad handlede det om? Vises kun naar vi kan sige det praecist.
        'detalje', coalesce(
          a.payload->>'kunde',
          a.payload->>'navn',
          a.payload->>'faktura',
          a.payload->>'modtager',
          (select coalesce(nullif(c.company,''), c.name)
             from bookings b left join customers c on c.id = b.customer_id
            where b.id = a.booking_id)),
        'hvornaar', a.created_at
      ) as p
      from audit_log a
      -- Systemets egne timekoersler er stoej i et menneskeligt overblik.
      where not (a.performed_by = 'system'
                 and a.action in ('proaktiv_gennemgang','prune_gamle_data'))
      order by a.created_at desc
      limit greatest(1, least(coalesce(p_antal,12), 50))
    ) x
  ), '[]'::jsonb));
end $function$;

revoke execute on function public.aktivitet_liste(integer) from public;
grant execute on function public.aktivitet_liste(integer) to authenticated, service_role;
