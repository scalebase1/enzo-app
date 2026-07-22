// menu-indtag: offentlig menu til hjemmesiden.
//
// GET -> menuer pr. AKTIVT madkoncept, i den raekkefoelge William har sat dem i
//        Enzo. Naar han retter en menu, aendrer hjemmesiden sig med det samme.
//        Ingen hardkodede retter paa hjemmesiden.
//
// verify_jwt=false: kaldes anonymt fra hjemmesiden. Laeser via service_role,
// men menuer_offentlig() returnerer KUN offentligt indhold — ingen id-er,
// ingen interne felter, ingen priser.
//
// CORS: whitelist, ikke '*'. Dette endpoint er bygget efter at booking-indtag
// havde staaet aabent i dagevis; her laases den fra start.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TILLADTE_ORIGINS = new Set([
  'https://casa-food.dk',
  'https://www.casa-food.dk',
  'https://casafood-vert.vercel.app',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
  // Kun ekko origin tilbage hvis den staar paa listen. Ukendte origins faar
  // ingen CORS-header og blokeres dermed af browseren — men svaret er stadig
  // 200, saa server-til-server-kald (curl, SSR) virker uaendret.
  if (origin && TILLADTE_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function svar(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  if (req.method !== 'GET') {
    return svar(405, { ok: false, fejl: 'Kun GET tilladt.' }, origin);
  }

  const klient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await klient.rpc('menuer_offentlig');

  if (error) {
    console.error('menuer_offentlig fejl:', error.message);
    return svar(500, { ok: false, fejl: 'Kunne ikke hente menuerne.' }, origin);
  }

  return svar(200, data ?? { ok: true, menuer: [] }, origin);
});
