// Design-tokens — ScaleBase/Casa Food. Restrained, funktionel intern app.
//
// Paletten er varm og dæmpet, saa vognenes egne farver (Casanova, The Blue
// Pearl m.fl.) kan skille sig ud uden at appen konkurrerer med dem.
// Knapper er MOERKE (primaer). Salvie-accenten bruges KUN hvor noget er
// aktivt: valgt menupunkt, fokus, links, egne beskeder. Ingen skygger —
// flader adskilles med 1px kant.
//
// De gamle noegler (blue, navy, slate …) er bevaret som aliaser, saa
// eksisterende sektioner reskinnes uden at skulle skrives om.
export const c = {
  // Flader
  bg: '#FAFAF8',        // varm off-white
  card: '#FFFFFF',
  line: '#E8E6E1',

  // Tekst
  ink: '#1C1B19',
  text: '#1C1B19',
  sub: '#6B6862',       // daempet

  // Handling
  primaer: '#2A2926',   // moerke knapper/piller
  accent: '#5F6F52',    // daempet salvie — kun aktive states

  // Betydning
  green: '#4A7C59',     // ok
  amber: '#A8761C',     // advarsel
  red: '#A64B42',       // fejl

  // --- Bagudkompatible aliaser (peger ind i paletten ovenfor) ---
  blue: '#5F6F52',      // "aktiv" -> accent
  blueDim: '#7A8A6C',
  navy: '#2A2926',      // sidebar -> primaer
  navy2: '#3A3833',
  slate: '#A9A69E',     // dæmpet paa moerk baggrund
  slate2: '#6B6862',
}

// Rolige, afstemte toner til status/badges — erstatter de skarpe pasteller.
export const tone = {
  neutral: { bg: '#F2F1ED', col: '#5B584F' },
  ok: { bg: '#E7EFE7', col: '#3B6349' },
  advarsel: { bg: '#F6EEDD', col: '#8A5F14' },
  fejl: { bg: '#F6E7E4', col: '#8C3E36' },
  aktiv: { bg: '#EAEEE5', col: '#4B5A40' },
}

export const radius = { kort: 12, pille: 999 }

export const sp = (n) => `${n * 4}px`

export const font =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
export const monoFont = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// To vaegte: 400 normal, 500 fremhaevet. Overskrifter 22/18/16. Broedtekst 15-16.
// Saetnings-case overalt — aldrig Title Case eller VERSALER.
export const vaegt = { normal: 400, fremhaev: 500 }
export const tekst = {
  h1: { fontSize: 22, fontWeight: 500, color: c.ink, margin: 0, letterSpacing: '-.01em' },
  h2: { fontSize: 18, fontWeight: 500, color: c.ink, margin: 0 },
  h3: { fontSize: 16, fontWeight: 500, color: c.ink, margin: 0 },
  brod: { fontSize: 15, fontWeight: 400, color: c.text },
  daempet: { fontSize: 15, fontWeight: 400, color: c.sub },
  lille: { fontSize: 13, fontWeight: 400, color: c.sub },
}

// Sektions-overskrift over en liste/blok. Sætnings-case, ingen versaler.
export const sektionTitel = {
  fontSize: 13,
  fontWeight: 500,
  color: c.sub,
  marginBottom: 10,
}

// Mindste klikflade paa touch.
export const TOUCH = 44

export const card = {
  background: c.card,
  border: `1px solid ${c.line}`,
  borderRadius: radius.kort,
  padding: 20,
}

export const btn = {
  border: '1px solid transparent',
  background: c.primaer,
  color: '#fff',
  borderRadius: radius.pille,
  padding: '11px 18px',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  minHeight: TOUCH,
  fontFamily: font,
  lineHeight: 1.2,
}

export const btnGhost = {
  ...btn,
  background: 'transparent',
  color: c.ink,
  border: `1px solid ${c.line}`,
}

export const input = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${c.line}`,
  borderRadius: 10,
  padding: '11px 12px',
  fontSize: 16,          // 16px undgaar auto-zoom paa iOS
  fontFamily: font,
  color: c.ink,
  background: c.card,
  marginBottom: 10,
}
