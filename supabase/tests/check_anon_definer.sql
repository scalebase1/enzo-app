-- check_anon_definer.sql
-- Sikkerheds-guard: FEJLER (non-zero exit via RAISE) hvis nogen SECURITY DEFINER-
-- funktion i skema 'public' er eksekverbar af rollen 'anon' og ikke står på
-- allowlisten nedenfor.
--
-- Baggrund: Supabase' default privileges tildeler historisk EXECUTE til 'anon' på
-- nye public-funktioner. SECURITY DEFINER-funktioner omgår RLS, så en anon-
-- eksekverbar definer-funktion er et potentielt hul. Se migrationen
-- 20260721005647_default_privileges_ingen_anon_execute.sql og
-- Vault/Inbox/supabase-anon-security-definer-root-cause.md.
--
-- Køres planlagt dagligt read-only mod PROD (se .github/workflows/anon-definer-guard.yml)
-- — fanger grants som Supabase gen-asserterer ved platformopgraderinger, uden for
-- vores migrationer. Kan også køres manuelt mod enhver DB med psql.

do $$
declare
  -- ── ALLOWLIST ────────────────────────────────────────────────────────────
  -- Funktioner der BEVIDST må være anon-eksekverbare. TOM MED VILJE.
  -- På dette projekt går al offentlig intake (booking/lead/madkoncepter) via
  -- edge functions med SERVICE_ROLE_KEY — INGEN public-funktion skal kaldes
  -- direkte af anon.
  --
  -- Tilføj KUN en funktion her hvis den dokumenteret SKAL være anon-kaldbar:
  --   allowlist text[] := array[
  --     'min_offentlige_funktion'  -- BEGRUNDELSE: <hvorfor>; godkendt af: <hvem>, <dato>
  --   ];
  -- En tilføjelse uden begrundelse + godkender er en fejl, ikke en løsning.
  allowlist text[] := array[]::text[];
  -- ─────────────────────────────────────────────────────────────────────────
  n int; liste text;
begin
  select count(*), string_agg(p.proname, ', ' order by p.proname)
    into n, liste
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and not (p.proname = any(allowlist));

  if n > 0 then
    raise exception
      'SIKKERHED: % anon-eksekverbar(e) SECURITY DEFINER-funktion(er) i public uden for allowlist: %',
      n, liste;
  end if;

  raise notice 'OK: ingen anon-eksekverbare SECURITY DEFINER-funktioner uden for allowlist.';
end $$;
