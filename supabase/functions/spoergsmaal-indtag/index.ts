// spoergsmaal-indtag: HTTP-port for "stil et spørgsmål"-formularen på hjemmesiden.
// En henvendelse UDEN booking (ingen dato, ingen koncept) — bare et spørgsmål.
// Lander som en lead i Kundekontakt-hub'en, og William får besked med det samme.
//
// Tynd wrapper — al logik ligger i den testede RPC offentlig_lead_opret.
// Holdt adskilt fra booking-indtag, så booking-flowet ikke røres.
//
// ÅBEN CORS indtil hjemmesidens domæne er koblet på — stram før go-live.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO før go-live: sæt til hjemmesidens domæne, fx 'https://casa-food.dk'
const ALLOWED_ORIGIN = '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function svar(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return svar(405, { ok: false, fejl: 'Kun POST tilladt.' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return svar(400, { ok: false, fejl: 'Ugyldig JSON i forespørgslen.' });
  }
  if (!payload || typeof payload !== 'object') {
    return svar(400, { ok: false, fejl: 'Tom forespørgsel.' });
  }

  // Honeypot: skjult felt '_hp'. Udfyldt = bot — svar 'ok', opret intet.
  const hp = (payload as Record<string, unknown>)['_hp'];
  if (hp !== undefined && hp !== null && String(hp).trim() !== '') {
    return svar(200, { ok: true, lead_id: null });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('offentlig_lead_opret', { p: payload });

  if (error) {
    console.error('offentlig_lead_opret fejl:', error.message);
    return svar(500, { ok: false, fejl: 'Der opstod en serverfejl. Prøv igen senere.' });
  }

  if (data && typeof data === 'object' && 'ok' in data && !(data as Record<string, unknown>).ok) {
    return svar(400, data);
  }

  return svar(200, data ?? { ok: true });
});
