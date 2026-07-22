-- Faktura som PDF. 13 fakturaer i systemet, 0 med pdf_url: faktura_send sendte
-- fakturateksten som broedtekst i en mail, uden bilag. Erhvervskunder forventer
-- et dokument, og bogfoeringspligten forudsaetter dokumentation.
--
-- ARBEJDSDELING: al fakturalogik (moms, betalingsfrist, lovpligtige felter,
-- validering af adresse og CVR) bliver i databasen — den er testet og virker.
-- faktura_tekst faar blot 'felter' med de samme vaerdier struktureret, saa edge
-- functionen kan LAYOUTE dem. Den regner ikke selv.
--
-- 'tekst' er uroert: faktura_send og kladdevisningen bruger den stadig.
-- Aendringen er rent additiv.
--
-- Bucket 'fakturaer' er PRIVAT. En faktura indeholder kundens navn, adresse og
-- beloeb; offentlig laesbar ville betyde at et gaettet filnavn giver adgang til
-- en anden kundes bilag. Adgang sker via signed URLs (7 dage) fra edge
-- functionen med service_role.
--
-- pdf_url gemmer STIEN, ikke den signerede URL — den udloeber, og en doed URL i
-- databasen er vaerre end ingen.

insert into storage.buckets (id, name, public)
values ('fakturaer', 'fakturaer', false)
on conflict (id) do nothing;

create or replace function public.faktura_saet_pdf(p_id uuid, p_sti text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if not (public.er_admin() or coalesce(auth.role(),'') = 'service_role') then
    return jsonb_build_object('ok',false,'fejl','Ikke autoriseret.');
  end if;

  if nullif(btrim(coalesce(p_sti,'')),'') is null then
    return jsonb_build_object('ok',false,'fejl','Sti mangler.');
  end if;

  update invoices set pdf_url = btrim(p_sti) where id = p_id;
  if not found then return jsonb_build_object('ok',false,'fejl','Fakturaen findes ikke.'); end if;

  return jsonb_build_object('ok',true);
end $function$;

revoke execute on function public.faktura_saet_pdf(uuid, text) from public;
grant  execute on function public.faktura_saet_pdf(uuid, text) to authenticated, service_role;
