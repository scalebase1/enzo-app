// faktura-pdf: genererer en dansk faktura som PDF og lagrer den i bucket'en
// 'fakturaer'. Returnerer en signed URL.
//
// HVORFOR: faktura_send sendte fakturaen som broedtekst i en mail. 13 fakturaer
// i systemet, 0 med pdf_url. Erhvervskunder forventer et bilag, og
// bogfoeringspligten forudsaetter dokumentation.
//
// ALT INDHOLD KOMMER FRA faktura_tekst().felter — momsberegning, betalingsfrist
// og de lovpligtige felter ligger i databasen og er testet. Denne funktion
// LAYOUTER kun; den regner ikke.
//
// AUTH: verify_jwt=false, men funktionen kraever selv en gyldig admin-JWT som
// den forwarder til RPC'en. faktura_tekst gater paa er_admin() eller
// service_role, saa en fremmed JWT faar 'Ikke autoriseret.' fra databasen.

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EKSPLICITTE = new Set(
  [
    ...(Deno.env.get('ENZO_ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    'https://enzo-zeta.vercel.app',
  ].filter((o) => o !== 'null'),
);
const VERCEL_MOENSTER = /^https:\/\/enzo(-[a-z0-9-]+)?\.vercel\.app$/;

function tilladt(origin: string | null): boolean {
  if (!origin || origin === 'null') return false;
  if (EKSPLICITTE.has(origin)) return true;
  return VERCEL_MOENSTER.test(origin);
}

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (origin && tilladt(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

const kr = (n: number) =>
  Number(n).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';

type Felter = {
  fakturanummer: string; fakturadato: string; forfaldsdato: string; betalingsfrist_dage: number;
  saelger: Record<string, string | null>;
  koeber: Record<string, string | null>;
  linjer: { beskrivelse: string; arrangement: string | null; kuverter: number | null; beloeb_ex: number }[];
  moms_sats: number; ex_moms: number; moms_beloeb: number; total: number;
};

async function byggPdf(f: Felter): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const side = doc.addPage([595.28, 841.89]); // A4
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const fed = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 56;                       // margin
  const B = 595.28 - M * 2;           // brugbar bredde
  const blaek = rgb(0.09, 0.11, 0.15);
  const svag = rgb(0.42, 0.45, 0.50);
  const linje = rgb(0.85, 0.87, 0.90);
  let y = 841.89 - M;

  const skriv = (t: string, x: number, size = 10, font = reg, farve = blaek) => {
    // pdf-lib's WinAnsi kan æøå, men ikke alt. Ukendte tegn ville kaste og
    // vaelte hele PDF'en, saa de erstattes frem for at fejle.
    const rent = String(t ?? '').replace(/[^\x20-\x7E -ÿ]/g, '?');
    side.drawText(rent, { x, y, size, font, color: farve });
  };
  const hr = (yy: number) => side.drawLine({
    start: { x: M, y: yy }, end: { x: M + B, y: yy }, thickness: 0.75, color: linje,
  });

  // --- Hoved: saelger til venstre, FAKTURA-nummer til hoejre ---
  skriv(f.saelger.navn ?? '', M, 16, fed);
  y -= 15;
  for (const l of [f.saelger.adresse, f.saelger.postnr_by, f.saelger.cvr ? 'CVR ' + f.saelger.cvr : null]) {
    if (!l) continue;
    skriv(l, M, 9.5, reg, svag);
    y -= 12;
  }

  let yh = 841.89 - M;
  const hx = M + B - 170;
  side.drawText('FAKTURA', { x: hx, y: yh, size: 22, font: fed, color: blaek });
  yh -= 22;
  side.drawText(f.fakturanummer, { x: hx, y: yh, size: 12, font: reg, color: svag });

  y = Math.min(y, yh) - 28;
  hr(y); y -= 22;

  // --- Modtager og datoer ---
  const kolY = y;
  skriv('FAKTURERES TIL', M, 8, fed, svag); y -= 14;
  skriv(f.koeber.navn ?? '', M, 11, fed); y -= 13;
  if (f.koeber.att) { skriv('Att.: ' + f.koeber.att, M, 9.5, reg, svag); y -= 12; }
  for (const del of String(f.koeber.adresse ?? '').split(/\n|,\s*/).filter(Boolean)) {
    skriv(del, M, 9.5); y -= 12;
  }

  let yd = kolY;
  const dx = M + B - 190;
  const dpar = (lab: string, val: string, fremhaev = false) => {
    side.drawText(lab, { x: dx, y: yd, size: 9, font: reg, color: svag });
    side.drawText(val, { x: dx + 105, y: yd, size: 9.5, font: fremhaev ? fed : reg, color: blaek });
    yd -= 14;
  };
  dpar('Fakturadato', f.fakturadato);
  dpar('Betalingsfrist', `${f.forfaldsdato}`, true);
  dpar('Netto', `${f.betalingsfrist_dage} dage`);

  y = Math.min(y, yd) - 22;

  // --- Linjetabel ---
  hr(y); y -= 15;
  skriv('BESKRIVELSE', M, 8, fed, svag);
  side.drawText('BELØB', { x: M + B - 80, y, size: 8, font: fed, color: svag });
  y -= 8;
  hr(y); y -= 18;

  for (const l of f.linjer) {
    skriv(l.beskrivelse, M, 10.5);
    const b = kr(l.beloeb_ex);
    side.drawText(b, { x: M + B - reg.widthOfTextAtSize(b, 10.5), y, size: 10.5, font: reg, color: blaek });
    y -= 13;
    const detaljer = [
      l.arrangement ? 'Arrangement ' + l.arrangement : null,
      l.kuverter ? l.kuverter + ' kuverter' : null,
    ].filter(Boolean).join('  ·  ');
    if (detaljer) { skriv(detaljer, M, 9, reg, svag); y -= 14; }
    y -= 4;
  }

  y -= 6; hr(y); y -= 18;

  // --- Totaler, hoejrestillet ---
  const tot = (lab: string, val: string, stor = false) => {
    const size = stor ? 12 : 10;
    const font = stor ? fed : reg;
    side.drawText(lab, { x: M + B - 240, y, size, font, color: stor ? blaek : svag });
    side.drawText(val, { x: M + B - font.widthOfTextAtSize(val, size), y, size, font, color: blaek });
    y -= stor ? 20 : 15;
  };
  tot('Beløb ekskl. moms', kr(f.ex_moms));
  tot(`Moms (${f.moms_sats}%)`, kr(f.moms_beloeb));
  y -= 4; hr(y); y -= 20;
  tot('AT BETALE', kr(f.total), true);

  // --- Betalingsinfo nederst ---
  y -= 24;
  if (f.saelger.bank_reg && f.saelger.bank_konto) {
    skriv(`Betaling til reg. ${f.saelger.bank_reg} konto ${f.saelger.bank_konto}.`, M, 9.5);
    y -= 13;
    skriv(`Anfør venligst fakturanummer ${f.fakturanummer} ved betaling.`, M, 9.5, reg, svag);
  }

  // Fod
  const fod = [f.saelger.navn, f.saelger.mail, f.saelger.telefon].filter(Boolean).join('  ·  ');
  side.drawText(fod.replace(/[^\x20-\x7E -ÿ]/g, '?'), {
    x: M, y: M - 18, size: 8.5, font: reg, color: svag,
  });

  return await doc.save();
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ ok: false, fejl: 'Kun POST tilladt.' }, 405, origin);

  const authz = req.headers.get('authorization') ?? '';
  const jwt = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
  if (!jwt) return json({ ok: false, fejl: 'Manglende session.' }, 401, origin);

  let body: { faktura_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, fejl: 'Ugyldig JSON.' }, 400, origin); }

  const id = (body.faktura_id ?? '').trim();
  if (!id) return json({ ok: false, fejl: 'faktura_id mangler.' }, 400, origin);

  // Hent indholdet MED kalderens JWT: gaten i faktura_tekst afgoer om han maa.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/faktura_tekst`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    console.error('faktura_tekst fejlede:', r.status, t);
    return json({ ok: false, fejl: `Kunne ikke hente fakturaen (${r.status}).` }, 502, origin);
  }
  const data = await r.json();
  // Backendens tekst vises ORDRET — den forklarer fx manglende adresse praecist.
  if (!data || data.ok === false) {
    return json({ ok: false, fejl: data?.fejl ?? 'Kunne ikke hente fakturaen.' }, 400, origin);
  }
  if (!data.felter) {
    return json({ ok: false, fejl: 'Fakturaen mangler strukturerede felter.' }, 500, origin);
  }

  let pdf: Uint8Array;
  try {
    pdf = await byggPdf(data.felter as Felter);
  } catch (e) {
    console.error('PDF-generering fejlede:', e);
    return json({ ok: false, fejl: 'Kunne ikke danne PDF.' }, 500, origin);
  }

  const sti = `${data.fakturanummer}.pdf`;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { error: upErr } = await admin.storage.from('fakturaer')
    .upload(sti, pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    console.error('upload fejlede:', upErr.message);
    return json({ ok: false, fejl: 'Kunne ikke gemme PDF.' }, 500, origin);
  }

  // Signed URL frem for offentlig: bucket'en er privat, og en faktura indeholder
  // kundens adresse og beloeb.
  const { data: signed, error: sErr } = await admin.storage.from('fakturaer')
    .createSignedUrl(sti, 60 * 60 * 24 * 7);
  if (sErr || !signed) {
    console.error('signeret url fejlede:', sErr?.message);
    return json({ ok: false, fejl: 'Kunne ikke lave link til PDF.' }, 500, origin);
  }

  // Gem stien (ikke den signerede URL — den udloeber). faktura_saet_pdf laeser
  // stien og laver et nyt link naar der er brug for et.
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/faktura_saet_pdf`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id, p_sti: sti }),
  });

  return json({
    ok: true,
    fakturanummer: data.fakturanummer,
    sti,
    url: signed.signedUrl,
    filnavn: `Faktura ${data.fakturanummer}.pdf`,
  }, 200, origin);
});
