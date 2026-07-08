import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, font } from '../ui.js'

const MDR = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december']
const UGEDAGE = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

// Mandag-foerste ugedag-index (0=man .. 6=soen)
const manIdx = (d) => (d.getDay() + 6) % 7
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const dateKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const sameDay = (a, b) => dateKey(a) === dateKey(b)

const fmtTid = (d) => d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
const fmtDag = (d) => d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function StatusBadge({ status, aflyst }) {
  let bg = '#E5E7EB', col = '#4B5563', txt = status || '—'
  if (aflyst) { bg = '#FEE2E2'; col = '#991B1B'; txt = 'aflyst' }
  else if (status === 'bekraeftet' || status === 'lukket') { bg = '#DCFCE7'; col = '#166534' }
  else if (status === 'klar_til_bekraeftelse') { bg = '#FEF3C7'; col = '#92400E' }
  return <span style={{ background: bg, color: col, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{txt}</span>
}

// Renser titel for teknisk stoej og "❌ AFLYST —"-praefiks til visning.
const renTitel = (t) => (t || '').replace(/^❌\s*AFLYST\s*—\s*/i, '').trim()

function Detalje({ booking, onClose }) {
  const start = new Date(booking.start)
  const slut = new Date(booking.slut)
  const linjer = (booking.beskrivelse || '').split('\n').filter((l) => l.trim())

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50, fontFamily: font }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: c.ink, textDecoration: booking.aflyst ? 'line-through' : 'none' }}>
            {renTitel(booking.titel)}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: 'pointer', padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <StatusBadge status={booking.status} aflyst={booking.aflyst} />
          {booking.lokation && <span style={{ fontSize: 13, color: c.sub }}>{booking.lokation}</span>}
        </div>

        <div style={{ fontSize: 14, color: c.text, marginTop: 12 }}>
          {fmtDag(start)}<br />
          <span style={{ color: c.sub }}>kl. {fmtTid(start)}–{fmtTid(slut)}</span>
        </div>

        {booking.aflyst && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>
            Denne booking er aflyst.
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linjer.map((l, i) => {
            const sep = l.indexOf(':')
            if (sep > 0 && sep < 24) {
              return (
                <div key={i} style={{ fontSize: 14 }}>
                  <span style={{ color: c.sub }}>{l.slice(0, sep)}:</span>
                  <span style={{ fontWeight: 600 }}> {l.slice(sep + 1).trim()}</span>
                </div>
              )
            }
            return <div key={i} style={{ fontSize: 14 }}>{l}</div>
          })}
        </div>
      </div>
    </div>
  )
}

function EventChip({ booking, onClick }) {
  const start = new Date(booking.start)
  const base = {
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderRadius: 6,
    padding: '3px 6px',
    fontSize: 11.5,
    lineHeight: 1.3,
    cursor: 'pointer',
    fontFamily: font,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
  }
  const stil = booking.aflyst
    ? { ...base, background: '#F1F5F9', color: c.slate2, textDecoration: 'line-through', borderLeft: `3px solid ${c.slate}` }
    : { ...base, background: '#E8F0FE', color: '#1E3A8A', borderLeft: `3px solid ${c.blue}` }
  return (
    <button style={stil} onClick={() => onClick(booking)} title={renTitel(booking.titel)}>
      <span style={{ fontWeight: 700 }}>{fmtTid(start)}</span> {renTitel(booking.titel)}
    </button>
  )
}

export default function Kalender() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setErr('')
    supabase.rpc('kalender_data').then(({ data, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) { setErr(error.message); return }
      if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente kalenderen.'); return }
      setData(data.bookinger || [])
    })
    return () => { alive = false }
  }, [])

  // Grupper bookinger paa dato-noegle (start-dagen).
  const perDag = useMemo(() => {
    const m = new Map()
    for (const b of data || []) {
      const k = dateKey(new Date(b.start))
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(b)
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.start) - new Date(b.start))
    return m
  }, [data])

  // 42 dage (6 uger) fra mandag foer den 1. i maaneden.
  const dage = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = addDays(first, -manIdx(first))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  const today = startOfDay(new Date())
  const iVisning = (data || []).filter((b) => {
    const d = new Date(b.start)
    return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()
  }).length

  const skift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Kalender</h1>
        {data && <span style={{ color: c.sub, fontSize: 14 }}>{iVisning} booking{iVisning === 1 ? '' : 'er'} denne måned</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Overblik over bookinger. Klik en booking for detaljer. (Visning — redigering og tildeling kommer senere.)</p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter kalenderen …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>Fejl: {err}</div>}

      {!loading && !err && data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <button style={btnGhost} onClick={() => skift(-1)} aria-label="Forrige måned">‹</button>
            <div style={{ fontSize: 18, fontWeight: 700, minWidth: 190, textTransform: 'capitalize' }}>
              {MDR[cursor.getMonth()]} {cursor.getFullYear()}
            </div>
            <button style={btnGhost} onClick={() => skift(1)} aria-label="Næste måned">›</button>
            <button style={{ ...btn, marginLeft: 4 }} onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)) }}>
              I dag
            </button>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {UGEDAGE.map((u) => (
                <div key={u} style={{ padding: '10px 8px', fontSize: 12, fontWeight: 700, color: c.sub, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: `1px solid ${c.line}` }}>
                  {u}
                </div>
              ))}
              {dage.map((d, i) => {
                const iMaaned = d.getMonth() === cursor.getMonth()
                const erIdag = sameDay(d, today)
                const evts = perDag.get(dateKey(d)) || []
                return (
                  <div
                    key={i}
                    style={{
                      minHeight: 108,
                      borderRight: (i % 7 !== 6) ? `1px solid ${c.line}` : 'none',
                      borderBottom: i < 35 ? `1px solid ${c.line}` : 'none',
                      background: iMaaned ? c.card : '#FAFBFC',
                      padding: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <div style={{ textAlign: 'right', marginBottom: 2 }}>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11,
                          fontSize: 12.5, fontWeight: erIdag ? 800 : 500,
                          color: erIdag ? '#fff' : (iMaaned ? c.text : c.slate),
                          background: erIdag ? c.blue : 'transparent',
                        }}
                      >
                        {d.getDate()}
                      </span>
                    </div>
                    {evts.map((b) => (
                      <EventChip key={b.booking_id} booking={b} onClick={setSelected} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: c.sub, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: '#E8F0FE', borderLeft: `3px solid ${c.blue}` }} /> Aktiv booking
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: '#F1F5F9', borderLeft: `3px solid ${c.slate}` }} /> Aflyst
            </span>
          </div>
        </>
      )}

      {selected && <Detalje booking={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
