-- TRE CHEFER I STEDET FOR EN.
--
-- Foer: er_admin() sammenlignede auth.uid() med EN vaerdi i business_config.
-- Casa Food har tre chefer fordelt paa koncepterne, alle med samme adgang.
--
-- VALG: cheferne bliver raekker i staff med rolle='chef' — ikke en separat
-- admin-tabel. Grunden er at de saa er PERSONER i systemet: de har navn og mail,
-- medarbejdere kan skrive til dem hver isaer, og de kan tildeles vagter (William
-- laver selv mad). En separat tabel ville kraeve at vi duplikerede alt det.
--
-- Fordi hver eneste af systemets 178 funktioner kalder er_admin() frem for at
-- tjekke selv, arver de alle aendringen. Ingen af dem roeres.
--
-- FALLBACK BEVARET: business_config.admin_auth_id gaelder stadig. Uden den ville
-- William blive laast ude i det sekund migrationen koerte, foer nogen er markeret
-- som chef. Den kan fjernes naar de tre rigtige chefer er oprettet.

alter table public.staff
  add column if not exists rolle text not null default 'medarbejder';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_rolle_gyldig'
  ) then
    alter table public.staff
      add constraint staff_rolle_gyldig check (rolle in ('chef','medarbejder'));
  end if;
end $$;

create index if not exists staff_rolle_idx on public.staff(rolle) where rolle = 'chef';

-- Den eksisterende admin markeres som chef, saa tilstanden er konsistent
-- med det nye felt fra foerste sekund.
update public.staff s
set rolle = 'chef'
where s.auth_user_id::text = (select value#>>'{}' from business_config where key='admin_auth_id');

create or replace function public.er_admin()
returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
  select
    -- Ny vej: enhver aktiv chef
    exists (
      select 1 from staff
      where auth_user_id = auth.uid()
        and rolle = 'chef'
        and active
    )
    -- Fallback: den oprindelige enkelt-admin. Fjernes naar de tre chefer staar.
    or (auth.uid() is not null
        and auth.uid()::text = coalesce(
          (select value#>>'{}' from business_config where key='admin_auth_id'), ''));
$function$;

-- aktuel_medarbejder() skal IKKE returnere en chef: den bruges til
-- medarbejder-visningen (egne vagter, egen loen). En chef ser admin-visningen.
-- Uden dette ville en chef kunne ende i begge verdener samtidig.
create or replace function public.aktuel_medarbejder()
returns uuid
language sql stable security definer
set search_path to 'public'
as $function$
  select id from staff
  where auth_user_id = auth.uid()
    and active
    and onboarding_status = 'aktiv'
    and rolle = 'medarbejder'
  limit 1;
$function$;

-- Hvem er chefer? Bruges af beskedsystemet (medarbejder vaelger modtager) og af
-- den kommende side hvor man tilfoejer og fjerner chefer.
create or replace function public.chefer_liste()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
begin
  -- Bevidst IKKE er_admin-gated: en medarbejder skal kunne se hvem han kan
  -- skrive til. Returnerer kun navn og id — ingen loen, ingen telefon.
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'fejl','Ikke logget ind.');
  end if;

  return jsonb_build_object('ok', true, 'chefer', coalesce((
    select jsonb_agg(jsonb_build_object(
      'staff_id', s.id,
      'navn', s.name,
      'har_login', s.auth_user_id is not null
    ) order by s.name)
    from staff s
    where s.rolle = 'chef' and s.active), '[]'::jsonb));
end $function$;

revoke execute on function public.chefer_liste() from public;
grant execute on function public.chefer_liste() to authenticated, service_role;

-- Goer en medarbejder til chef, eller omvendt. Kun en chef kan aendre det.
create or replace function public.saet_rolle(p_staff_id uuid, p_rolle text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_navn text; v_har_login boolean; v_antal_chefer int;
begin
  if not public.er_admin() then
    return jsonb_build_object('ok',false,'fejl','Kun en chef kan ændre roller.');
  end if;
  if p_rolle not in ('chef','medarbejder') then
    return jsonb_build_object('ok',false,'fejl','Rollen skal være chef eller medarbejder.');
  end if;

  select name, auth_user_id is not null into v_navn, v_har_login
  from staff where id = p_staff_id;
  if v_navn is null then
    return jsonb_build_object('ok',false,'fejl','Personen findes ikke.');
  end if;

  if p_rolle = 'chef' and not v_har_login then
    return jsonb_build_object('ok',false,'fejl',
      v_navn||' har intet login endnu. Send en invitation først — en chef uden login kan ikke komme ind.');
  end if;

  -- Sidste chef maa ikke kunne degradere sig selv. Ellers staar systemet uden
  -- nogen der kan aendre noget, og det kraever databaseadgang at komme ud af.
  if p_rolle = 'medarbejder' then
    select count(*) into v_antal_chefer from staff where rolle='chef' and active and id <> p_staff_id;
    if v_antal_chefer = 0 then
      return jsonb_build_object('ok',false,'fejl',
        'Der skal være mindst én chef. Gør en anden til chef først.');
    end if;
  end if;

  update staff set rolle = p_rolle where id = p_staff_id;

  return jsonb_build_object('ok',true,'navn',v_navn,'rolle',p_rolle,
    'besked', case when p_rolle='chef'
                   then v_navn||' er nu chef og har fuld adgang.'
                   else v_navn||' er nu almindelig medarbejder.' end);
end $function$;

revoke execute on function public.saet_rolle(uuid, text) from public;
grant execute on function public.saet_rolle(uuid, text) to authenticated, service_role;
