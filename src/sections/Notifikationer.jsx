import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, font } from '../ui.js'

const fmtTid = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Kanaler er visuelt distinkte — Telegram (blaa) vs Email (violet).
const KANAL = {
  telegram: { bg: '#E8F0FE', col: '#1E3A8A', prik: '#0066FF', txt: 'Telegram' },
  email: { bg: '#F3E8FF', col: '#6B21A8', prik: '#9333EA', txt: 'Email' } }

function KanalBadge({ kanal }) {
  const k = KANAL[kanal] || { bg: '#F1F5F9', col: c.slate2, prik: c.slate, txt: kanal || 'ukendt' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: k.bg, color: k.col, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: k.prik }} />
      {k.txt}
    </span>
  )
}

function StatusTekst({ status }) {
  const map = {
    sendt: { col: '#166534', txt: 'sendt' },
    fejlet: { col: c.red, txt: 'fejlet' },
    afventer: { col: '#92400E', txt: 'afventer' } }
  const s = map[status] || { col: c.slate2, txt: status || '—' }
  return <span style={{ fontSize: 12, fontWeight: 600, color: s.col }}>{s.txt}</span>
}

function FilterPill({ aktiv, onClick, tekst, antal }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1.5px solid ${aktiv ? c.ink : c.line}`,
        background: aktiv ? c.ink : c.card,
        color: aktiv ? '#fff' : c.slate2,
        borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font,
        display: 'inline-flex', alignItems: 'center', gap: 7 }}
    >
      {tekst}
      <span style={{ fontSize: 12, fontWeight: 700, color: aktiv ? '#fff' : c.slate, opacity: aktiv ? 0.85 : 1 }}>{antal}</span>
    </button>
  )
}

export default function Notifikationer() {
  const [liste, setListe] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('alle') // 'alle' | 'telegram' | 'email'

  const load = useCallback(async () => {
    setErr('')
    const { data, error } = await supabase.rpc('notifikationer_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente notifikationer.'); return }
    setListe(data.notifikationer || [])
  }, [])

  useEffect(() => { load() }, [load])

  const antal = useMemo(() => {
    const a = { alle: (liste || []).length, telegram: 0, email: 0 }
    for (const n of liste || []) if (a[n.kanal] != null) a[n.kanal]++
    return a
  }, [liste])

  // RPC leverer allerede nyeste foerst — bevar orden, filtrér kun paa kanal.
  const synlige = filter === 'alle' ? (liste || []) : (liste || []).filter((n) => n.kanal === filter)

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Notifikationer</h1>
        {liste && <span style={{ color: c.sub, fontSize: 14 }}>{liste.length} notifikation{liste.length === 1 ? '' : 'er'}</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Enzos proaktive nudges til William — historik over afsendte beskeder.</p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter notifikationer …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && liste && (
        <>
          {liste.length > 0 && (
            <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
              <FilterPill aktiv={filter === 'alle'} onClick={() => setFilter('alle')} tekst="Alle" antal={antal.alle} />
              <FilterPill aktiv={filter === 'telegram'} onClick={() => setFilter('telegram')} tekst="Telegram" antal={antal.telegram} />
              <FilterPill aktiv={filter === 'email'} onClick={() => setFilter('email')} tekst="Email" antal={antal.email} />
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: liste.length > 0 ? 0 : 16 }}>
            {liste.length === 0 && <div style={{ padding: 20, color: c.sub }}>Ingen notifikationer endnu.</div>}
            {liste.length > 0 && synlige.length === 0 && (
              <div style={{ padding: 20, color: c.sub }}>Ingen {filter === 'email' ? 'email' : 'telegram'}-notifikationer.</div>
            )}
            {synlige.map((n, i) => (
              <div key={n.id} style={{ padding: '14px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
                <div style={{ fontSize: 14.5, lineHeight: 1.5, color: c.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.besked}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <KanalBadge kanal={n.kanal} />
                  <StatusTekst status={n.status} />
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
