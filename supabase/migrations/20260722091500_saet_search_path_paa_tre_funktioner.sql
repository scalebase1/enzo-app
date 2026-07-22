-- Tre funktioner havde mutable search_path (advisor: function_search_path_mutable).
-- hub_indbakke_hastighed_timer er ny fra i dag; de to andre har staaet aabne laenge.
-- Ingen af dem er SECURITY DEFINER, saa risikoen er lav — men en tom advisorliste
-- goer det muligt at se nye problemer naar de opstaar.

alter function public.hub_indbakke_hastighed_timer(integer) set search_path = 'public';
alter function public.set_updated_at() set search_path = 'public';
alter function public.kunde_farve_palet() set search_path = 'public';
