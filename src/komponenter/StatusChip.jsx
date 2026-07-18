import { c, tone, radius } from '../ui.js'

// Backend leverer paene danske labels i 'status_tekst' paa de RPC'er der har det.
// Har vi kun den raa enum, gengiver vi den laeseligt (understreg -> mellemrum)
// frem for at opfinde en oversaettelse.
const TONER = {
  bekraeftet: tone.ok, lukket: tone.ok, betalt: tone.ok, aktiv: tone.ok,
  udfoert: tone.ok, sendt: tone.ok,
  klar_til_bekraeftelse: tone.advarsel, afventer: tone.advarsel, ny: tone.advarsel,
  klar: tone.advarsel, udstedt: tone.advarsel, kladde: tone.neutral,
  tildelt: tone.aktiv, inviteret: tone.aktiv, aaben: tone.advarsel,
  aflyst: tone.fejl, afvist: tone.fejl, fejlet: tone.fejl, inaktiv: tone.fejl,
}

// Faelles dansk gengivelse af de enum-vaerdier appen viser. Bruges KUN som
// fallback: har RPC'en et 'status_tekst', vinder det altid.
const LABEL = {
  aaben: 'åben', bekraeftet: 'bekræftet', udfoert: 'udført',
  klar_til_bekraeftelse: 'afventer', afventer_medarbejder: 'afventer',
  afventer_godkendelse: 'afventer godkendelse',
}

const laeseligt = (s) => {
  const n = String(s || '')
  const t = LABEL[n] || n.replace(/_/g, ' ')
  return t.replace(/^./, (x) => x.toUpperCase())
}

export default function StatusChip({ status, tekst, farve, style }) {
  const vis = tekst || laeseligt(status)
  if (!vis) return null
  const t = farve || TONER[status] || tone.neutral
  return (
    <span
      style={{
        background: t.bg, color: t.col, fontSize: 12, fontWeight: 500,
        padding: '3px 10px', borderRadius: radius.pille, whiteSpace: 'nowrap',
        display: 'inline-block', ...style,
      }}
    >
      {vis}
    </span>
  )
}
