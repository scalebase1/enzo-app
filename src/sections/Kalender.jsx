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
const iMaaned = (d, cursor) => d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()

const fmtTid = (d) => d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
const fmtDag = (d) => d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const fmtDatoKort = (d) => d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })
const harTid = (d) => d.getHours() !== 0 || d.getMinutes() !== 0
// Postgres time "16:00:00" -> "16.00"
const fmtKlokke = (t) => (typeof t === 'string' ? t.slice(0, 5).replace(':', '.') : '')

const TONE = {
  blue: { background: '#E8F0FE', color: '#1E3A8A', border: c.blue },
  green: { background: '#DCFCE7', color: '#166534', border: c.green },
  slate: { background: '#F1F5F9', color: c.slate2, border: c.slate },
}

// Renser titel for teknisk stoej og "❌ AFLYST —"-praefiks til visning.
const renTitel = (t) => (t || '').replace(/^❌\s*AFLYST\s*—\s*/i, '').trim()

// ---- Genbrugelig maaneds-grid (controlled cursor). events: normaliserede
// { key, start:Date, chip:{ tid?, label, tone, struck }, raw }. onSelect(raw). ----
function MaanedsGrid({ cursor, onCursor, events, onSelect }) {
  const perDag = useMemo(() => {
    const m = new Map()
    for (const e of events) {
      const k = dateKey(e.start)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(e)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start - b.start)
    return m
  }, [events])

  const dage = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = addDays(first, -manIdx(first))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  const today = startOfDay(new Date())
  const skift = (n) => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
        <button style={btnGhost} onClick={() => skift(-1)} aria-label="Forrige måned">‹</button>
        <div style={{ fontSize: 18, fontWeight: 700, minWidth: 190, textTransform: 'capitalize' }}>
          {MDR[cursor.getMonth()]} {cursor.getFullYear()}
        </div>
        <button style={btnGhost} onClick={() => skift(1)} aria-label="Næste måned">›</button>
        <button style={{ ...btn, marginLeft: 4 }} onClick={() => { const n = new Date(); onCursor(new Date(n.getFullYear(), n.getMonth(), 1)) }}>
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
            const inMonth = iMaaned(d, cursor)
            const erIdag = sameDay(d, today)
            const evts = perDag.get(dateKey(d)) || []
            return (
              <div
                key={i}
                style={{
                  minHeight: 108,
                  borderRight: (i % 7 !== 6) ? `1px solid ${c.line}` : 'none',
                  borderBottom: i < 35 ? `1px solid ${c.line}` : 'none',
                  background: inMonth ? c.card : '#FAFBFC',
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
                      color: erIdag ? '#fff' : (inMonth ? c.text : c.slate),
                      background: erIdag ? c.blue : 'transparent',
                    }}
                  >
                    {d.getDate()}
                  </span>
                </div>
                {evts.map((e) => {
                  const t = TONE[e.chip.tone] || TONE.blue
                  return (
                    <button
                      key={e.key}
                      onClick={() => onSelect(e.raw)}
                      title={e.chip.label}
                      style={{
                        width: '100%', textAlign: 'left', border: 'none', borderRadius: 6,
                        padding: '3px 6px', fontSize: 11.5, lineHeight: 1.3, cursor: 'pointer',
                        fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                        background: t.background, color: t.color, borderLeft: `3px solid ${t.border}`,
                        textDecoration: e.chip.struck ? 'line-through' : 'none',
                      }}
                    >
                      {e.chip.tid && <span style={{ fontWeight: 700 }}>{e.chip.tid} </span>}
                      {e.chip.label}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: c.sub, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <span key={it.tekst} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: TONE[it.tone].background, borderLeft: `3px solid ${TONE[it.tone].border}` }} /> {it.tekst}
        </span>
      ))}
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50, fontFamily: font }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function ModalHead({ titel, struck, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.ink, textDecoration: struck ? 'line-through' : 'none' }}>{titel}</div>
      <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: 'pointer', padding: 0 }}>×</button>
    </div>
  )
}

// ---------------- Admin ----------------

function BookingBadge({ status, aflyst }) {
  let bg = '#E5E7EB', col = '#4B5563', txt = status || '—'
  if (aflyst) { bg = '#FEE2E2'; col = '#991B1B'; txt = 'aflyst' }
  else if (status === 'bekraeftet' || status === 'lukket') { bg = '#DCFCE7'; col = '#166534' }
  else if (status === 'klar_til_bekraeftelse') { bg = '#FEF3C7'; col = '#92400E' }
  return <span style={{ background: bg, color: col, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{txt}</span>
}

function BookingDetalje({ booking, onClose }) {
  const start = new Date(booking.start)
  const slut = new Date(booking.slut)
  const linjer = (booking.beskrivelse || '').split('\n').filter((l) => l.trim())
  return (
    <Modal onClose={onClose}>
      <ModalHead titel={renTitel(booking.titel)} struck={booking.aflyst} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <BookingBadge status={booking.status} aflyst={booking.aflyst} />
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
    </Modal>
  )
}

function AdminKalender() {
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

  const events = useMemo(() => (data || []).map((b) => {
    const start = new Date(b.start)
    return {
      key: b.booking_id,
      start,
      chip: { tid: fmtTid(start), label: renTitel(b.titel), tone: b.aflyst ? 'slate' : 'blue', struck: b.aflyst },
      raw: b,
    }
  }), [data])

  const iVisning = (data || []).filter((b) => iMaaned(new Date(b.start), cursor)).length

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
          <MaanedsGrid cursor={cursor} onCursor={setCursor} events={events} onSelect={setSelected} />
          <Legend items={[{ tone: 'blue', tekst: 'Aktiv booking' }, { tone: 'slate', tekst: 'Aflyst' }]} />
        </>
      )}

      {selected && <BookingDetalje booking={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ---------------- Medarbejder ----------------

function VagtBadge({ status }) {
  const bekr = status === 'bekraeftet'
  return (
    <span style={{ background: bekr ? '#DCFCE7' : '#E8F0FE', color: bekr ? '#166534' : '#1E3A8A', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
      {bekr ? 'bekræftet' : 'tildelt'}
    </span>
  )
}

function VagtDetalje({ vagt, onClose }) {
  const d = new Date(vagt.dato)
  return (
    <Modal onClose={onClose}>
      <ModalHead titel={vagt.koncept} onClose={onClose} />
      <div style={{ marginTop: 10 }}><VagtBadge status={vagt.status} /></div>
      <div style={{ fontSize: 14, color: c.text, marginTop: 12 }}>
        {fmtDag(d)}
        {harTid(d) && <><br /><span style={{ color: c.sub }}>kl. {fmtTid(d)}</span></>}
      </div>
      <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Koncept:</span><span style={{ fontWeight: 600 }}> {vagt.koncept}</span></div>
        <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Kuverter:</span><span style={{ fontWeight: 600 }}> {vagt.covers}</span></div>
        <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Status:</span><span style={{ fontWeight: 600 }}> {vagt.status === 'bekraeftet' ? 'bekræftet' : 'tildelt'}</span></div>
      </div>
    </Modal>
  )
}

function MiniListe({ titel, note, tom, children }) {
  return (
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>{titel}</div>
        {note && <div style={{ fontSize: 12, color: c.slate2 }}>{note}</div>}
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {tom ? <div style={{ padding: '18px 16px', color: c.sub, fontSize: 14 }}>{tom}</div> : children}
      </div>
    </div>
  )
}

function MedarbejderKalender() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setErr('')
    supabase.rpc('medarbejder_kalender').then(({ data, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) { setErr(error.message); return }
      if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente din kalender.'); return }
      setData(data)
    })
    return () => { alive = false }
  }, [])

  const vagter = data?.mine_vagter || []
  const aabne = data?.aabne_vagter || []
  const ledighed = data?.min_ledighed || []

  const events = useMemo(() => vagter.map((v) => ({
    key: v.shift_id,
    start: new Date(v.dato),
    chip: { label: `${v.koncept} · ${v.covers} kuverter`, tone: v.status === 'bekraeftet' ? 'green' : 'blue', struck: false },
    raw: v,
  })), [vagter])

  const iVisning = vagter.filter((v) => iMaaned(new Date(v.dato), cursor)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Kalender</h1>
        {data && <span style={{ color: c.sub, fontSize: 14 }}>{iVisning} vagt{iVisning === 1 ? '' : 'er'} denne måned</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Dine tildelte vagter{data?.medarbejder?.navn ? ` — ${data.medarbejder.navn}` : ''}. Klik en vagt for detaljer.
      </p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter din kalender …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>Fejl: {err}</div>}

      {!loading && !err && data && (
        <>
          <MaanedsGrid cursor={cursor} onCursor={setCursor} events={events} onSelect={setSelected} />
          <Legend items={[{ tone: 'green', tekst: 'Bekræftet' }, { tone: 'blue', tekst: 'Tildelt' }]} />

          <div style={{ display: 'flex', gap: 20, marginTop: 28, flexWrap: 'wrap' }}>
            <MiniListe
              titel="Åbne vagter"
              note="mangler bemanding"
              tom={aabne.length === 0 ? 'Ingen åbne vagter lige nu.' : null}
            >
              {aabne.map((v) => (
                <div key={v.shift_id} style={{ padding: '12px 16px', borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v.koncept}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2, textTransform: 'capitalize' }}>{fmtDatoKort(new Date(v.dato))}</div>
                  </div>
                  <div style={{ fontSize: 13, color: c.slate2 }}>{v.covers} kuverter</div>
                </div>
              ))}
            </MiniListe>

            <MiniListe
              titel="Min ledighed"
              note="redigering kommer senere"
              tom={ledighed.length === 0 ? 'Ingen registreret ledighed endnu.' : null}
            >
              {ledighed.map((l) => {
                const interval = l.fra_tid && l.til_tid ? `${fmtKlokke(l.fra_tid)}–${fmtKlokke(l.til_tid)}` : (l.fra_tid ? `fra ${fmtKlokke(l.fra_tid)}` : '')
                return (
                  <div key={l.id} style={{ padding: '12px 16px', borderTop: `1px solid ${c.line}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{fmtDatoKort(new Date(l.dato))}</div>
                      {interval && <div style={{ fontSize: 13, color: c.slate2 }}>{interval}</div>}
                    </div>
                    {l.note && <div style={{ fontSize: 13, color: c.sub, marginTop: 3 }}>{l.note}</div>}
                  </div>
                )
              })}
            </MiniListe>
          </div>
        </>
      )}

      {selected && <VagtDetalje vagt={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ---------------- Rolle-detektion ----------------

export default function Kalender() {
  const [rolle, setRolle] = useState(undefined) // 'admin' | 'medarbejder'
  const [rolleFejl, setRolleFejl] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('er_admin').then(({ data, error }) => {
      if (!alive) return
      if (error) { setRolleFejl(error.message); return }
      setRolle(data === true ? 'admin' : 'medarbejder')
    })
    return () => { alive = false }
  }, [])

  if (rolleFejl) {
    return (
      <div>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Kalender</h1>
        <div style={{ ...card, marginTop: 16, color: c.red }}>Fejl: {rolleFejl}</div>
      </div>
    )
  }
  if (rolle === undefined) {
    return (
      <div>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Kalender</h1>
        <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter kalenderen …</div>
      </div>
    )
  }
  return rolle === 'admin' ? <AdminKalender /> : <MedarbejderKalender />
}
