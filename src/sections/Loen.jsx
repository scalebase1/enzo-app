import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, font, sp } from '../ui.js'

const MDR = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december']
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const timerFmt = (n) => `${Number(n || 0).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`
const satsFmt = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr/t`

const PERIODER = [
  { key: 'denne', label: 'Denne måned' },
  { key: 'sidste', label: 'Sidste måned' },
  { key: 'iaar', label: 'I år' },
]

// Frontend-beregnede datoer pr. periode (RPC bruger check_in >= fra og < til,
// EKSKLUSIV øvre grænse). Derfor er "til" starten af naeste enhed: for 'denne'
// og 'iaar' = i morgen kl. 00 (saa hele i dag medregnes, som RPC'ens nu+1dag-
// default), for 'sidste' = 1. i denne maaned. JS Date ruller korrekt over
// maaned/aar (31. jul + 1 → 1. aug), saa ingen special-casing er noedvendig.
function beregnDatoer(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const imorgen = new Date(y, m, now.getDate() + 1)
  if (key === 'denne') return { fra: new Date(y, m, 1), til: imorgen }
  if (key === 'sidste') return { fra: new Date(y, m - 1, 1), til: new Date(y, m, 1) }
  return { fra: new Date(y, 0, 1), til: imorgen } // 'iaar'
}

function periodeLabel(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'denne') return `${cap(MDR[m])} ${y}`
  if (key === 'sidste') return `${cap(MDR[(m + 11) % 12])} ${m === 0 ? y - 1 : y}`
  return `${y}`
}

function Pill({ aktiv, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1.5px solid ${aktiv ? c.ink : c.line}`,
        background: aktiv ? c.ink : c.card,
        color: aktiv ? '#fff' : c.slate2,
        borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font,
      }}
    >
      {children}
    </button>
  )
}

function TotalTile({ label, value }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  )
}

function MdrRaekke({ m, daempet, i }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', opacity: daempet ? 0.55 : 1, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 130 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.navn}</div>
        <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{satsFmt(m.timeloen)}</div>
      </div>
      <div style={{ fontSize: 13.5, color: c.slate2, minWidth: 74, textAlign: 'right' }}>{timerFmt(m.timer)}</div>
      <div style={{ fontSize: 15, fontWeight: 800, minWidth: 96, textAlign: 'right', color: daempet ? c.slate2 : c.ink }}>{kr(m.loen)}</div>
    </div>
  )
}

export default function Loen() {
  const [periode, setPeriode] = useState('iaar')
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    // Bevar tidligere data synlig under periode-skift (undgaa flimmer) — loading
    // gater kun foerste hentning; genindlaesning swapper data ind naar den er klar.
    setErr('')
    const { fra, til } = beregnDatoer(periode)
    supabase.rpc('loen_oversigt', { p_fra: iso(fra), p_til: iso(til) }).then(({ data, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) { setErr(error.message); return }
      if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente løn-oversigten.'); return }
      setData(data)
    })
    return () => { alive = false }
  }, [periode])

  const medarbejdere = data?.medarbejdere || []
  const total = data?.total || {}
  // RPC leverer allerede loen desc → bevar orden; del i har-timer / uden-timer.
  const { medTimer, udenTimer } = useMemo(() => ({
    medTimer: medarbejdere.filter((m) => Number(m.timer) > 0),
    udenTimer: medarbejdere.filter((m) => !(Number(m.timer) > 0)),
  }), [medarbejdere])

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Løn</h1>
        <span style={{ color: c.sub, fontSize: 14 }}>{periodeLabel(periode)}</span>
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Timer og løn pr. medarbejder for perioden.</p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {PERIODER.map((p) => (
          <Pill key={p.key} aktiv={periode === p.key} onClick={() => setPeriode(p.key)}>{p.label}</Pill>
        ))}
      </div>

      {loading && <div style={{ ...card, color: c.sub }}>Henter løn-oversigten …</div>}
      {err && <div style={{ ...card, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: sp(3) }}>
            <TotalTile label="Timer i alt" value={timerFmt(total.timer)} />
            <TotalTile label="Løn i alt" value={kr(total.loen)} />
            <TotalTile label="Medarbejdere med timer" value={Number(total.medarbejdere_med_timer || 0).toLocaleString('da-DK')} />
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: sp(3) }}>
            {medarbejdere.length === 0 ? (
              <div style={{ padding: 20, color: c.sub }}>Ingen aktive medarbejdere.</div>
            ) : (
              <>
                {medTimer.length === 0 && (
                  <div style={{ padding: '16px', color: c.sub, fontSize: 14 }}>Ingen registrerede timer i perioden.</div>
                )}
                {medTimer.map((m, i) => <MdrRaekke key={`${m.navn}-${i}`} m={m} i={i} />)}

                {udenTimer.length > 0 && (
                  <>
                    <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: c.slate, background: c.bg, borderTop: medTimer.length > 0 ? `1px solid ${c.line}` : 'none' }}>
                      Uden registrerede timer i perioden
                    </div>
                    {udenTimer.map((m, i) => <MdrRaekke key={`u-${m.navn}-${i}`} m={m} i={i} daempet />)}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
