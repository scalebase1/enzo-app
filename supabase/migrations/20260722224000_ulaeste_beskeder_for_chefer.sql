-- ULAESTE BESKEDER VIRKEDE IKKE FOR CHEFER.
--
-- besked_traade_liste havde 'ulaeste' hardkodet til 0 naar er_admin() var sand.
-- Det var rigtigt dengang William kun SENDTE beskeder — han var aldrig modtager,
-- saa der var intet at markere som ulaest.
--
-- Nu kan medarbejdere skrive til ledelsen, og saa er chefen modtager. Uden dette
-- ser en ny sygemelding praecis ud som en besked han laeste i forrige uge.
--
-- min_staff_id() kan ikke bruges: den peger paa aktuel_medarbejder(), som netop
-- er begraenset til rolle='medarbejder' (saa en chef ikke havner i begge
-- verdener). Derfor en ny mit_staff_id() der returnerer personens raekke uanset
-- rolle.

create or replace function public.mit_staff_id()
returns uuid
language sql stable security definer
set search_path to 'public'
as $function$
  select id from staff where auth_user_id = auth.uid() and active limit 1;
$function$;

revoke execute on function public.mit_staff_id() from public;
grant execute on function public.mit_staff_id() to authenticated, service_role;

create or replace function public.besked_traade_liste()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
set "TimeZone" to 'Europe/Copenhagen'
as $function$
declare v_admin boolean; v_mig uuid; v_mig_alle uuid;
begin
  v_admin := er_admin();
  v_mig := min_staff_id();          -- kun medarbejdere; styrer hvilke traade der ses
  v_mig_alle := mit_staff_id();     -- ogsaa chefer; styrer ulaest-taelleren

  if not v_admin and v_mig is null then return jsonb_build_object('ok',false,'fejl','Ikke autoriseret.'); end if;

  return jsonb_build_object('ok',true,'er_admin',v_admin,'traade', coalesce((
    select jsonb_agg(t order by t->>'sidste_aktivitet' desc) from (
      select jsonb_build_object(
        'id', tr.id,
        'emne', coalesce(tr.emne,'(uden emne)'),
        'type', tr.type,
        'booking_id', tr.booking_id,
        'sidste_aktivitet', tr.sidste_aktivitet,
        'deltagere', (select coalesce(jsonb_agg(st.name),'[]'::jsonb)
                        from besked_deltagere d join staff st on st.id=d.staff_id
                       where d.traad_id=tr.id),
        'seneste', (select b.tekst from beskeder b where b.traad_id=tr.id order by b.oprettet_at desc limit 1),
        -- Gaelder nu ALLE med en staff-raekke, ogsaa chefer.
        'ulaeste', case when v_mig_alle is null then 0 else (
            select count(*) from beskeder b join besked_status s on s.besked_id=b.id
             where b.traad_id=tr.id and s.staff_id=v_mig_alle and s.laest_at is null) end,
        'kvittering', case when v_admin then (
            select jsonb_build_object(
              'sendt',   count(*),
              'laest',   count(*) filter (where s.laest_at is not null),
              'handlet', count(*) filter (where s.handlet_at is not null))
            from beskeder b join besked_status s on s.besked_id=b.id
            where b.traad_id=tr.id) else null end
      ) as t
      from besked_traade tr
      where v_admin or exists (select 1 from besked_deltagere d where d.traad_id=tr.id and d.staff_id=v_mig)
    ) x
  ), '[]'::jsonb));
end $function$;

-- besked_marker_laest skal ogsaa virke for en chef. Den brugte min_staff_id(),
-- som er null for chefer — saa deres beskeder kunne aldrig blive markeret laest.
create or replace function public.besked_marker_laest(p_besked_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_mig uuid; v_fundet int;
begin
  v_mig := public.mit_staff_id();
  if v_mig is null then return jsonb_build_object('ok',false,'fejl','Ikke en aktiv bruger.'); end if;

  update besked_status set laest_at = now()
  where besked_id = p_besked_id and staff_id = v_mig and laest_at is null;
  get diagnostics v_fundet = row_count;

  return jsonb_build_object('ok', true, 'opdateret', v_fundet);
end $function$;

revoke execute on function public.besked_marker_laest(uuid) from public;
grant execute on function public.besked_marker_laest(uuid) to authenticated, service_role;
