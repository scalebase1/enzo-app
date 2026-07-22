import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, font } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'

const fmtTid = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Kanaler er visuelt distinkte — Telegram (blaa) vs Email (violet).
const KANAL = {
  telegram: { bg: '#EAEEE5', col: '#4B5A40', prik: '#0066FF', txt: 'Telegram' },
  email: { bg: '#F3E8FF', col: '#6B21A8', prik: '#9333EA', txt: 'Email' } }

function KanalBadge({ kanal }) {
  const k = KANAL[kanal] || { bg: '#F2F1ED', col: c.slate2, prik: c.slate, txt: kanal || 'ukendt' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: k.bg, color: k.col, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: k.prik }} />
      {k.txt}
    </span>
  )
}

function StatusTekst({ status, tekst }) {
  return <StatusChip status={status} tekst={tekst} />
}

function FilterPill({ aktiv, onClick, tekst, antal }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1.5px solid ${aktiv ? c.ink : c.line}`,
        background: aktiv ? c.ink : c.card,
        color: aktiv ? '#fff' : c.slate2,
        borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: font,
        display: 'inline-flex', alignItems: 'center', gap: 7 }}
    >
      {tekst}
      <span style={{ fontSize: 12, fontWeight: 500, color: aktiv ? '#fff' : c.slate, opacity: aktiv ? 0.85 : 1 }}>{antal}</span>
    </button>
  )
}

// En notifikation kan indeholde en hel fakturatekst. Vist ubeskaaret fyldte én
// post to skaermbilleder, og listen blev ulaeselig. Vi viser derfor de foerste
// linjer og folder resten ud paa klik — teksten er stadig tilgaengelig, den
// bestemmer bare ikke laengere hvor lang siden er.
const KLIP = 180

function Besked({ tekst }) {
  const [aaben, setAaben] = useState(false)
  const fuld = String(tekst || '')
  const lang = fuld.length > KLIP
  const vist = aaben || !lang ? fuld : fuld.slice(0, KLIP).trimEnd() + '…'
  return (
    <div>
      <div style={{ fontSize: 14.5, lineHeight: 1.5, color: c.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{vist}</div>
      {lang && (
        <button
          onClick={() => setAaben((v) => !v)}
          style={{ border: 'none', background: 'transparent', padding: '4px 0 0', cursor: 'pointer', fontFamily: font, fontSize: 13, color: c.slate2, fontWeight: 500 }}
        >
          {aaben ? 'Vis mindre' : 'Vis hele beskeden'}
        </button>
      )}
    </div>
  )
}

export default function Notifikationer() {
  const [liste, setListe] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  // Perioden er det primaere filter: 206 poster i én liste er ikke et arkiv,
  // det er stoej. Standard er 7 dage — historikken er der stadig, den er bare
  // ikke det foerste William ser.
  const [periode, setPeriode] = useState('7')     // '7' | '30' | 'alle'
  const [filter, setFilter] = useState('alle')    // kanal

  const load = useCallback(async () => {
    setErr('')
    const { data, error } = await supabase.rpc('notifikationer_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente notifikationer.'); return }
    setListe(data.notifikationer || [])
  }, [])

  useEffect(() => { load() }, [load])

  // Perioden anvendes FOER kanal, saa kanaltaellerne matcher det viste.
  const iPeriode = useMemo(() => {
    if (periode === 'alle') return liste || []
    const graense = Date.now() - Number(periode) * 86400000
    return (liste || []).filter((n) => {
      const t = new Date(n.tid).getTime()
      return !Number.isFinite(t) || t >= graense    // ulaeselig dato skjules aldrig
    })
  }, [liste, periode])

  // Kanaler udledes af data frem for en fast liste: Telegram blev taget ud af
  // systemet 16-07-2026, og et fast filter for en doed kanal er en knap der
  // altid viser nul.
  const kanaler = useMemo(() => {
    const set = new Map()
    for (const n of iPeriode) set.set(n.kanal, (set.get(n.kanal) || 0) + 1)
    return [...set.entries()].sort((a, b) => b[1] - a[1])
  }, [iPeriode])

  // RPC leverer allerede nyeste foerst — bevar orden.
  const synlige = filter === 'alle' ? iPeriode : iPeriode.filter((n) => n.kanal === filter)

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Notifikationer</h1>
        {liste && (
          <span style={{ color: c.sub, fontSize: 14 }}>
            {synlige.length} af {liste.length} notifikation{liste.length === 1 ? '' : 'er'}
          </span>
        )}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Enzos proaktive nudges til William — historik over afsendte beskeder.</p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter notifikationer …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && liste && (
        <>
          {liste.length > 0 && (
            <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap', alignItems: 'center' }}>
              <FilterPill aktiv={periode === '7'} onClick={() => setPeriode('7')} tekst="7 dage" antal={undefined} />
              <FilterPill aktiv={periode === '30'} onClick={() => setPeriode('30')} tekst="30 dage" antal={undefined} />
              <FilterPill aktiv={periode === 'alle'} onClick={() => setPeriode('alle')} tekst="Alt" antal={liste.length} />
              {kanaler.length > 1 && (
                <>
                  <span style={{ width: 1, height: 20, background: c.line, margin: '0 4px' }} />
                  <FilterPill aktiv={filter === 'alle'} onClick={() => setFilter('alle')} tekst="Alle kanaler" antal={iPeriode.length} />
                  {kanaler.map(([k, n]) => (
                    <FilterPill key={k} aktiv={filter === k} onClick={() => setFilter(k)} tekst={k === 'email' ? 'Email' : k} antal={n} />
                  ))}
                </>
              )}
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: liste.length > 0 ? 0 : 16 }}>
            {liste.length === 0 && <div style={{ padding: 20, color: c.sub }}>Ingen notifikationer endnu.</div>}
            {liste.length > 0 && synlige.length === 0 && (
              <div style={{ padding: 20, color: c.sub }}>
                Ingen notifikationer i perioden. Vælg “Alt” for at se hele historikken.
              </div>
            )}
            {synlige.map((n, i) => (
              <div key={n.id} style={{ padding: '14px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
                <Besked tekst={n.besked} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <KanalBadge kanal={n.kanal} />
                  <StatusTekst status={n.status} tekst={n.status_tekst} />
                  {(n.kunde || n.enhed) && (
                    <span style={{ fontSize: 12.5, color: c.sub }}>
                      {n.kunde || ''}{n.kunde && n.enhed ? ' · ' : ''}{n.enhed || ''}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: c.slate2, whiteSpace: 'nowrap' }}>{fmtTid(n.tid)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
