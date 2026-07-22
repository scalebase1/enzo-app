// booking-indtag: HTTP-port for hjemmesidens bookingformular.
// Tynd wrapper — al forretningslogik ligger i testede RPC'er.
//
// GET  -> returnerer AKTIVE madkoncepter, så formularen kan bygge sin koncept-vælger
//         dynamisk. Når William tilføjer/deaktiverer et koncept i Enzo, ændrer
//         formularen sig automatisk. Ingen hardkodede koncepter i formularen.
// POST -> opretter bookingen (kunde genkendes/oprettes, CVR valideres, flere koncepter).
//
// verify_jwt=false: kaldes anonymt fra hjemmesiden. Skriver via service_role.
// ÅBEN CORS indtil hjemmesidens rigtige domæne er koblet på — stram før go-live.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO før go-live: sæt til hjemmesidens domæne, fx 'https://casa-food.dk'
const ALLOWED_ORIGIN = '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function svar(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function klient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // --- GET: hent aktive madkoncepter til formularens vælger ---
  if (req.method === 'GET') {
    const { data, error } = await klient().rpc('madkoncepter_offentlig');
    if (error) {
      console.error('madkoncepter_offentlig fejl:', error.message);
      return svar(500, { ok: false, fejl: 'Kunne ikke hente koncepter.' });
    }
    return svar(200, { ok: true, koncepter: data ?? [] });
  }

  if (req.method !== 'POST') {
    return svar(405, { ok: false, fejl: 'Kun GET og POST tilladt.' });
  }

  // --- POST: opret booking ---
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return svar(400, { ok: false, fejl: 'Ugyldig JSON i forespørgslen.' });
  }

  if (!payload || typeof payload !== 'object') {
    return svar(400, { ok: false, fejl: 'Tom forespørgsel.' });
  }

  // Honeypot: skjult felt '_hp'. Udfyldt = bot. Svar 'ok' så botten tror det
  // lykkedes, men opret intet.
  const hp = (payload as Record<string, unknown>)['_hp'];
  if (hp !== undefined && hp !== null && String(hp).trim() !== '') {
    return svar(200, { ok: true, booking_id: null });
  }

  const { data, error } = await klient().rpc('offentlig_booking_opret', { p: payload });

  if (error) {
    console.error('offentlig_booking_opret fejl:', error.message);
    return svar(500, { ok: false, fejl: 'Der opstod en serverfejl. Prøv igen senere.' });
  }

  // RPC returnerer {ok:false, fejl:...} ved valideringsfejl — send videre som 400
  if (data && typeof data === 'object' && 'ok' in data && !(data as Record<string, unknown>).ok) {
    return svar(400, data);
  }

  return svar(200, data ?? { ok: true });
});
