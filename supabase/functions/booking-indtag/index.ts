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

// CORS-whitelist. Stod paa '*' siden 17-07-2026 med en TODO om at stramme foer
// go-live: hjemmesidens domaene fandtes ikke endnu. Det goer det nu, og en aaben
// intake betyder at hvem som helst kan poste bookinger/spoergsmaal ind i
// Williams system fra et hvilket som helst domaene.
//
// Ukendte origins faar INGEN CORS-header og blokeres af browseren. Svaret er
// stadig 200, saa server-til-server-kald (curl, SSR, tests) virker uaendret —
// CORS er en browser-mekanisme, ikke en adgangskontrol. Den rigtige beskyttelse
// mod misbrug er honeypot-feltet og validering i offentlig_*_opret.
const TILLADTE_ORIGINS = new Set([
  'https://casa-food.dk',
  'https://www.casa-food.dk',
  'https://casafood-vert.vercel.app',
]);

function corsFor(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
  if (origin && TILLADTE_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function svar(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(origin), 'Content-Type': 'application/json' },
  });
}

function klient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsFor(origin) });
  }

  // --- GET: hent aktive madkoncepter til formularens vælger ---
  if (req.method === 'GET') {
    const { data, error } = await klient().rpc('madkoncepter_offentlig');
    if (error) {
      console.error('madkoncepter_offentlig fejl:', error.message);
      return svar(500, { ok: false, fejl: 'Kunne ikke hente koncepter.' }, origin);
    }
    return svar(200, { ok: true, koncepter: data ?? [] }, origin);
  }

  if (req.method !== 'POST') {
    return svar(405, { ok: false, fejl: 'Kun GET og POST tilladt.' }, origin);
  }

  // --- POST: opret booking ---
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return svar(400, { ok: false, fejl: 'Ugyldig JSON i forespørgslen.' }, origin);
  }

  if (!payload || typeof payload !== 'object') {
    return svar(400, { ok: false, fejl: 'Tom forespørgsel.' }, origin);
  }

  // Honeypot: skjult felt '_hp'. Udfyldt = bot. Svar 'ok' så botten tror det
  // lykkedes, men opret intet.
  const hp = (payload as Record<string, unknown>)['_hp'];
  if (hp !== undefined && hp !== null && String(hp).trim() !== '') {
    return svar(200, { ok: true, booking_id: null }, origin);
  }

  const { data, error } = await klient().rpc('offentlig_booking_opret', { p: payload });

  if (error) {
    console.error('offentlig_booking_opret fejl:', error.message);
    return svar(500, { ok: false, fejl: 'Der opstod en serverfejl. Prøv igen senere.' }, origin);
  }

  // RPC returnerer {ok:false, fejl:...} ved valideringsfejl — send videre som 400
  if (data && typeof data === 'object' && 'ok' in data && !(data as Record<string, unknown>).ok) {
    return svar(400, data, origin);
  }

  return svar(200, data ?? { ok: true }, origin);
});
