import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font } from '../ui.js'
import BookingForm from '../components/BookingForm.jsx'

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
const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const TONE = {
  blue: { background: '#E8F0FE', color: '#1E3A8A', border: c.blue },
  green: { background: '#DCFCE7', color: '#166534', border: c.green },
  slate: { background: '#F1F5F9', color: c.slate2, border: c.slate },
}

// chip.tone kan vaere en TONE-noegle eller et farve-objekt (enheds-farver).
const toneStil = (tone) => (tone && typeof tone === 'object' ? tone : (TONE[tone] || TONE.blue))

// Enheds-farver: catering i blaa-familien, vogne i tydeligt adskilte nuancer.
// Tildeles i enheder_liste-raekkefoelge (type, navn) — stabil pr. session.
const CATERING_FARVER = [
  { background: '#E8F0FE', color: '#1E3A8A', border: '#0066FF' }, // blaa
  { background: '#E0E7FF', color: '#3730A3', border: '#6366F1' }, // indigo
]
const VOGN_FARVER = [
  { background: '#F3E8FF', color: '#6B21A8', border: '#9333EA' }, // lilla
  { background: '#CCFBF1', color: '#115E59', border: '#0D9488' }, // teal
  { background: '#FFEDD5', color: '#9A3412', border: '#EA580C' }, // orange
  { background: '#FCE7F3', color: '#9D174D', border: '#DB2777' }, // pink
]
// Amber "kraever handling" — bevidst adskilt fra TONE.slate (aflyst) saa en
// aktiv booking uden enhed ikke ligner en aflyst i grid og signaturforklaring.
const UDEN_ENHED_FARVE = { background: '#FEF9C3', color: '#854D0E', border: '#CA8A04' }

function byggeEnhedFarver(enheder) {
  const m = new Map()
  let ci = 0, vi = 0
  for (const e of enheder) {
    if (e.type === 'catering') m.set(e.navn, CATERING_FARVER[ci++ % CATERING_FARVER.length])
    else m.set(e.navn, VOGN_FARVER[vi++ % VOGN_FARVER.length])
  }
  return m
}

// Fremhaevet logistik-tekst (booking.info / vagt.info) — driftskritisk.
function InfoBoks({ tekst }) {
  if (!tekst) return null
  return (
    <div style={{ marginTop: 14, padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.04em' }}>Info · logistik</div>
      <div style={{ fontSize: 14, marginTop: 5, whiteSpace: 'pre-wrap', color: c.ink }}>{tekst}</div>
    </div>
  )
}

// "Casanova · hentes på lageret kl. 10 …" under en vagt-linje.
function EnhedInfoLinje({ enhed, info }) {
  if (!enhed && !info) return null
  return (
    <div style={{ fontSize: 12.5, marginTop: 3, overflowWrap: 'break-word' }}>
      {enhed && <span style={{ fontWeight: 700 }}>{enhed}</span>}
      {enhed && info && <span style={{ color: c.sub }}> · </span>}
      {info && <span style={{ color: c.sub }}>{info}</span>}
    </div>
  )
}

// Renser titel for teknisk stoej og "❌ AFLYST —"-praefiks til visning.
const renTitel = (t) => (t || '').replace(/^❌\s*AFLYST\s*—\s*/i, '').trim()

// ---- Genbrugelig maaneds-grid (controlled cursor). events: normaliserede
// { key, start:Date, chip:{ tid?, label, tone, struck }, raw }. onSelect(raw). ----
function MaanedsGrid({ cursor, onCursor, events, onSelect, onDayClick }) {
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
                onClick={onDayClick ? () => onDayClick(d) : undefined}
                style={{
                  minHeight: 108,
                  borderRight: (i % 7 !== 6) ? `1px solid ${c.line}` : 'none',
                  borderBottom: i < 35 ? `1px solid ${c.line}` : 'none',
                  background: inMonth ? c.card : '#FAFBFC',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  cursor: onDayClick ? 'pointer' : 'default',
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
                  const t = toneStil(e.chip.tone)
                  return (
                    <button
                      key={e.key}
                      onClick={(ev) => { ev.stopPropagation(); onSelect(e.raw) }}
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
      {items.map((it) => {
        const t = toneStil(it.tone)
        return (
          <span key={it.tekst} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: t.background, borderLeft: `3px solid ${t.border}` }} /> {it.tekst}
          </span>
        )
      })}
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

const DAEKNING = {
  fuldt_bemandet: { bg: '#DCFCE7', border: '#86EFAC', col: '#166534', tekst: 'Fuldt bemandet — ingen åbne vagter.' },
  vagter_aabnet: { bg: '#E8F0FE', border: '#93C5FD', col: '#1E3A8A', tekst: 'Vagter åbnet — alle nødvendige vagter er oprettet.' },
  delvis: { bg: '#FEF3C7', border: '#FCD34D', col: '#92400E', tekst: 'Delvis — der mangler stadig bemanding ift. behovet.' },
}

function ShiftBadge({ status }) {
  const map = {
    aaben: { bg: '#FEF3C7', col: '#92400E', txt: 'åben' },
    tildelt: { bg: '#E8F0FE', col: '#1E3A8A', txt: 'tildelt' },
    bekraeftet: { bg: '#DCFCE7', col: '#166534', txt: 'bekræftet' },
    byttet: { bg: '#F1F5F9', col: '#4B5563', txt: 'byttet' },
    aflyst: { bg: '#FEE2E2', col: '#991B1B', txt: 'aflyst' },
  }
  const s = map[status] || { bg: '#E5E7EB', col: '#4B5563', txt: status || '—' }
  return <span style={{ background: s.bg, color: s.col, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{s.txt}</span>
}

function BookingDetalje({ booking, enhedFarve, onClose, onVagtChange, onRediger }) {
  const start = new Date(booking.start)
  const slut = new Date(booking.slut)
  const linjer = (booking.beskrivelse || '').split('\n').filter((l) => l.trim())

  const [bemBusy, setBemBusy] = useState(false)
  const [bemFejl, setBemFejl] = useState('')
  const [bemRes, setBemRes] = useState(null)

  // Vagt-roster + tildel-styring
  const [roster, setRoster] = useState(null)
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterFejl, setRosterFejl] = useState('')
  const [medarbejdere, setMedarbejdere] = useState([])
  const [valgtStaff, setValgtStaff] = useState({}) // shift_id -> staff_id
  const [vagtBusy, setVagtBusy] = useState(null)     // shift_id under handling
  const [vagtFejl, setVagtFejl] = useState('')
  const [behov, setBehov] = useState(null)           // raa booking-felter (staff_required m.m.)

  const loadRoster = useCallback(async () => {
    setRosterFejl('')
    const { data, error } = await supabase.rpc('booking_vagter', { p_booking_id: booking.booking_id })
    setRosterLoading(false)
    if (error) { setRosterFejl(error.message); return }
    if (!data || data.ok === false) { setRosterFejl(data?.fejl || 'Kunne ikke hente vagter.'); return }
    setRoster(data.vagter || [])
  }, [booking.booking_id])

  // Raa behovs-felter (staff_required) — supplerende, saa en fejl ikke braekker modalen.
  const hentBehov = useCallback(() => {
    supabase.rpc('booking_hent', { p_id: booking.booking_id }).then(({ data }) => {
      if (data && data.ok !== false) setBehov(data.booking || null)
    })
  }, [booking.booking_id])

  useEffect(() => {
    loadRoster()
    hentBehov()
    supabase.rpc('medarbejdere_liste').then(({ data }) => {
      if (data && data.ok !== false) setMedarbejdere(data.medarbejdere || [])
    })
  }, [loadRoster, hentBehov])

  const aktive = medarbejdere.filter((m) => m.onboarding_status === 'aktiv')

  async function vagtHandling(aktion, payload, shiftId) {
    setVagtBusy(shiftId); setVagtFejl('')
    const { data, error } = await supabase.rpc('admin_handling', { p_aktion: aktion, p_payload: payload })
    if (error) { setVagtBusy(null); setVagtFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { setVagtBusy(null); setVagtFejl(data?.fejl || 'Handlingen fejlede.'); return }
    // Genhent detaljens egne data (vagtrække + behov) OG udløs parent-reload,
    // saa "Personale:" i beskrivelsen opdateres uden at lukke/genaabne.
    await loadRoster()
    hentBehov()
    onVagtChange?.()
    setVagtBusy(null)
  }

  function tildel(shiftId) {
    const staffId = valgtStaff[shiftId]
    if (!staffId) { setVagtFejl('Vælg en medarbejder først.'); return }
    vagtHandling('vagt_tildel', { shift_id: shiftId, staff_id: staffId }, shiftId)
  }

  async function bem() {
    setBemBusy(true); setBemFejl(''); setBemRes(null)
    const { data, error } = await supabase.rpc('auto_beman', { p_booking_id: booking.booking_id })
    setBemBusy(false)
    if (error) { setBemFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { setBemFejl(data?.fejl || 'Kunne ikke åbne vagter.'); return }
    setBemRes(data)
    loadRoster()
    onVagtChange?.()
  }

  const d = bemRes ? (DAEKNING[bemRes.daekning] || { bg: '#F1F5F9', border: c.line, col: c.text, tekst: bemRes.daekning }) : null
  const selectStil = { ...input, marginBottom: 0, padding: '8px 10px', flex: 1, minWidth: 0 }

  return (
    <Modal onClose={onClose}>
      <ModalHead titel={renTitel(booking.titel)} struck={booking.aflyst} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <BookingBadge status={booking.status} aflyst={booking.aflyst} />
        {booking.enhed && (
          <span style={{ background: (enhedFarve || UDEN_ENHED_FARVE).background, color: (enhedFarve || UDEN_ENHED_FARVE).color, border: `1px solid ${(enhedFarve || UDEN_ENHED_FARVE).border}`, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
            {booking.enhed}{booking.enhed_type ? ` · ${booking.enhed_type}` : ''}
          </span>
        )}
        {booking.lokation && <span style={{ fontSize: 13, color: c.sub }}>{booking.lokation}</span>}
        {!booking.aflyst && onRediger && (
          <button style={{ ...btnGhost, padding: '6px 12px', fontSize: 13, marginLeft: 'auto' }} onClick={onRediger}>Rediger</button>
        )}
      </div>
      <div style={{ fontSize: 14, color: c.text, marginTop: 12 }}>
        {fmtDag(start)}<br />
        <span style={{ color: c.sub }}>kl. {fmtTid(start)}–{fmtTid(slut)}</span>
      </div>
      {behov && behov.staff_required != null && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <span style={{ color: c.sub }}>Medarbejdere:</span> <span style={{ fontWeight: 700 }}>{behov.staff_required}</span> <span style={{ color: c.slate2, fontSize: 12.5 }}>(behov — se “Personale” nedenfor for tildelte)</span>
        </div>
      )}
      {booking.aflyst && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>
          Denne booking er aflyst.
        </div>
      )}
      <InfoBoks tekst={booking.info} />
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

      {!booking.aflyst && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
          <button style={{ ...btn, width: '100%', opacity: bemBusy ? 0.6 : 1 }} onClick={bem} disabled={bemBusy}>
            {bemBusy ? 'Åbner vagter …' : 'Åbn vagter & notificér ledige'}
          </button>
          {bemFejl && <div style={{ marginTop: 10, fontSize: 13, color: c.red }}>{bemFejl}</div>}
          {d && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: d.bg, border: `1px solid ${d.border}`, color: d.col, borderRadius: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.tekst}</div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {bemRes.vagter_oprettet} {bemRes.vagter_oprettet === 1 ? 'vagt' : 'vagter'} åbnet · {bemRes.medarbejdere_notificeret} medarbejder{bemRes.medarbejdere_notificeret === 1 ? '' : 'e'} notificeret
              </div>
              {bemRes.aabne_vagter > 0 && bemRes.medarbejdere_notificeret === 0 && (
                <div style={{ marginTop: 4, fontSize: 12.5 }}>Ingen ledige medarbejdere på datoen at notificere endnu.</div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
        <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Vagter</div>
        {rosterLoading && <div style={{ color: c.sub, fontSize: 14 }}>Henter vagter …</div>}
        {rosterFejl && <div style={{ color: c.red, fontSize: 13 }}>Fejl: {rosterFejl}</div>}
        {!rosterLoading && !rosterFejl && roster && roster.length === 0 && (
          <div style={{ color: c.sub, fontSize: 14 }}>Ingen vagter på denne booking endnu.</div>
        )}
        {!rosterLoading && !rosterFejl && roster && roster.map((v, i) => {
          const rowStil = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }
          if (v.status === 'aaben') {
            return (
              <div key={v.shift_id} style={rowStil}>
                <ShiftBadge status="aaben" />
                <select
                  style={selectStil}
                  value={valgtStaff[v.shift_id] || ''}
                  disabled={!!vagtBusy}
                  onChange={(e) => setValgtStaff((s) => ({ ...s, [v.shift_id]: e.target.value }))}
                >
                  <option value="">Vælg medarbejder …</option>
                  {aktive.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
                </select>
                <button style={{ ...btn, padding: '8px 12px', opacity: vagtBusy ? 0.6 : 1 }} disabled={!!vagtBusy} onClick={() => tildel(v.shift_id)}>
                  {vagtBusy === v.shift_id ? '…' : 'Tildel'}
                </button>
              </div>
            )
          }
          const kanStyres = v.status === 'tildelt' || v.status === 'bekraeftet'
          return (
            <div key={v.shift_id} style={rowStil}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{v.staff_navn || 'Ukendt'}</span>
              </div>
              <ShiftBadge status={v.status} />
              {kanStyres && (
                <>
                  <button style={{ ...btnGhost, padding: '7px 11px', opacity: vagtBusy ? 0.6 : 1 }} disabled={!!vagtBusy} onClick={() => vagtHandling('vagt_aaben', { shift_id: v.shift_id }, v.shift_id)}>
                    Frigør
                  </button>
                  <button style={{ ...btnGhost, padding: '7px 11px', color: c.red, opacity: vagtBusy ? 0.6 : 1 }} disabled={!!vagtBusy} onClick={() => vagtHandling('vagt_slet', { id: v.shift_id }, v.shift_id)}>
                    Fjern
                  </button>
                </>
              )}
            </div>
          )
        })}
        {vagtFejl && <div style={{ marginTop: 10, fontSize: 13, color: c.red }}>{vagtFejl}</div>}
      </div>

      <IndkoebSektion bookingId={booking.booking_id} />
      <OekonomiSektion bookingId={booking.booking_id} />
    </Modal>
  )
}

// ---------------- Indkøbsliste + økonomi (admin, på booking-detaljen) ----------------

// Beloeb: null/undefined -> '—' (ALDRIG "0 kr" naar data bare mangler).
const fmtKr = (n) => (n == null ? '—' : `${Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 })} kr`)
const fmtPct = (n) => (n == null ? null : `${Number(n).toLocaleString('da-DK', { maximumFractionDigits: 1 })}%`)

const SEKTION_STIL = { marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14 }
const SEKTION_TITEL = { fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }

function IndkoebSektion({ bookingId }) {
  const [loading, setLoading] = useState(true)
  const [fejl, setFejl] = useState('')          // hent-fejl (vises i stedet for listen)
  const [items, setItems] = useState([])        // [{ vare, maengde, koebt }]
  const [godkendt, setGodkendt] = useState(false)
  const [opdateret, setOpdateret] = useState(null)
  const [note, setNote] = useState('')          // forslags-note
  const [busy, setBusy] = useState(null)        // 'forslag' | 'gem'
  const [handlingFejl, setHandlingFejl] = useState('')
  const [kvittering, setKvittering] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('indkoeb_hent', { p_booking_id: bookingId }).then(({ data, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) { setFejl(error.message); return }
      if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke hente indkøbslisten.'); return }
      setItems(Array.isArray(data.items) ? data.items : [])
      setGodkendt(data.godkendt === true)
      setOpdateret(data.opdateret || null)
    })
    return () => { alive = false }
  }, [bookingId])

  const saetItem = (i, felt, vaerdi) =>
    setItems((rows) => rows.map((r, ix) => (ix === i ? { ...r, [felt]: vaerdi } : r)))
  const fjern = (i) => setItems((rows) => rows.filter((_, ix) => ix !== i))
  const tilfoej = () => setItems((rows) => [...rows, { vare: '', maengde: '', koebt: false }])

  async function foreslaa() {
    setBusy('forslag'); setHandlingFejl(''); setKvittering('')
    const { data, error } = await supabase.rpc('indkoeb_forslag', { p_booking_id: bookingId })
    setBusy(null)
    if (error) { setHandlingFejl(error.message); return }
    if (!data || data.ok === false) { setHandlingFejl(data?.fejl || 'Kunne ikke lave et forslag.'); return }
    setItems(Array.isArray(data.forslag) ? data.forslag : [])
    setNote(data.note || '')
  }

  async function gem() {
    setBusy('gem'); setHandlingFejl(''); setKvittering('')
    // Helt tomme raekker (hverken vare eller maengde) er UI-rester — de gemmes ikke.
    const rene = items
      .map((r) => ({ vare: (r.vare || '').trim(), maengde: (r.maengde || '').trim(), koebt: r.koebt === true }))
      .filter((r) => r.vare !== '' || r.maengde !== '')
    const { data, error } = await supabase.rpc('indkoeb_gem', {
      p_booking_id: bookingId,
      p_items: rene,
      p_godkendt: godkendt,
    })
    setBusy(null)
    if (error) { setHandlingFejl(error.message); return }
    if (!data || data.ok === false) { setHandlingFejl(data?.fejl || 'Kunne ikke gemme listen.'); return }
    setItems(rene)
    setKvittering(`Gemt — ${data.antal_varer} ${data.antal_varer === 1 ? 'vare' : 'varer'}.`)
  }

  const koebte = items.filter((r) => r.koebt === true).length
  const inputU = { ...input, marginBottom: 0, padding: '8px 10px' }

  return (
    <div style={SEKTION_STIL}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={SEKTION_TITEL}>Indkøbsliste</div>
        {items.length > 0 && (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: koebte === items.length ? c.green : c.slate2 }}>
            {koebte} af {items.length} varer købt
          </div>
        )}
      </div>

      {loading && <div style={{ color: c.sub, fontSize: 14 }}>Henter indkøbsliste …</div>}
      {fejl && <div style={{ color: c.red, fontSize: 13, whiteSpace: 'pre-wrap' }}>{fejl}</div>}

      {!loading && !fejl && (
        <>
          {items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ color: c.sub, fontSize: 14 }}>Ingen indkøbsliste endnu.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={{ ...btn, padding: '9px 14px', opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={foreslaa}>
                  {busy === 'forslag' ? 'Foreslår …' : 'Foreslå indkøbsliste'}
                </button>
                <button style={{ ...btnGhost, padding: '9px 14px' }} disabled={!!busy} onClick={tilfoej}>
                  + Tilføj vare
                </button>
              </div>
            </div>
          ) : (
            <>
              {note && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: 9, fontSize: 13 }}>
                  {note}
                </div>
              )}
              {items.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
                  <input
                    type="checkbox"
                    checked={r.koebt === true}
                    onChange={(e) => saetItem(i, 'koebt', e.target.checked)}
                    style={{ margin: 0, flexShrink: 0 }}
                    title="Købt"
                  />
                  <input
                    style={{ ...inputU, flex: 2, minWidth: 0, textDecoration: r.koebt ? 'line-through' : 'none' }}
                    value={r.vare || ''}
                    onChange={(e) => saetItem(i, 'vare', e.target.value)}
                    placeholder="Vare"
                  />
                  <input
                    style={{ ...inputU, flex: 1, minWidth: 0 }}
                    value={r.maengde || ''}
                    onChange={(e) => saetItem(i, 'maengde', e.target.value)}
                    placeholder="Mængde"
                  />
                  <button
                    onClick={() => fjern(i)}
                    disabled={!!busy}
                    title="Fjern vare"
                    style={{ border: 'none', background: 'transparent', color: c.slate2, fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button style={{ ...btnGhost, padding: '8px 12px' }} disabled={!!busy} onClick={tilfoej}>+ Tilføj vare</button>
                <button style={{ ...btn, padding: '8px 14px', opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={gem}>
                  {busy === 'gem' ? 'Gemmer …' : 'Gem'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={godkendt} onChange={(e) => setGodkendt(e.target.checked)} style={{ margin: 0 }} />
                  Markér som godkendt
                </label>
              </div>
            </>
          )}

          {handlingFejl && <div style={{ marginTop: 10, fontSize: 13, color: c.red, whiteSpace: 'pre-wrap' }}>{handlingFejl}</div>}
          {kvittering && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: c.green }}>{kvittering}</div>}
          {opdateret && !kvittering && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: c.sub }}>
              Sidst gemt {new Date(opdateret).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{godkendt ? ' · godkendt' : ''}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Diskret farve paa daekningsgraden: sund groen, tynd amber, negativ roed.
const gradFarve = (pct) => (pct == null ? c.sub : pct < 0 ? c.red : pct < 25 ? c.amber : pct < 50 ? c.slate2 : c.green)

function OekonomiSektion({ bookingId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fejl, setFejl] = useState('')
  const [vareInput, setVareInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [saetFejl, setSaetFejl] = useState('')

  const beregn = useCallback(async () => {
    setFejl('')
    const { data: d, error } = await supabase.rpc('beregn_daekningsbidrag', { p_booking_id: bookingId })
    setLoading(false)
    if (error) { setFejl(error.message); return null }
    if (!d || d.ok === false) { setFejl(d?.fejl || 'Kunne ikke beregne dækningsbidraget.'); return null }
    setData(d)
    return d
  }, [bookingId])

  useEffect(() => {
    let alive = true
    beregn().then((d) => {
      // Forudfyld feltet med den gemte vaerdi (kun ved foerste hent).
      if (alive && d && d.vareomkostning != null) {
        setVareInput(String(d.vareomkostning).replace('.', ','))
      }
    })
    return () => { alive = false }
  }, [beregn])

  async function gemVareomkostning() {
    setSaetFejl('')
    // Dansk talformat: "7.000,50" og "7000,50" virker; "7.000" er tusindtal;
    // rent punktum-decimal ("7000.5") accepteres ogsaa. Tomt felt er ikke et beloeb.
    let t = vareInput.trim()
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
    const belob = Number(t)
    if (t === '' || Number.isNaN(belob)) {
      setSaetFejl('Skriv et beløb, fx 7000 eller 7.000,50.')
      return
    }
    setBusy(true)
    const { data: d, error } = await supabase.rpc('booking_saet_vareomkostning', {
      p_booking_id: bookingId,
      p_vareomkostning: belob,
    })
    if (error) { setBusy(false); setSaetFejl(error.message); return }
    if (!d || d.ok === false) { setBusy(false); setSaetFejl(d?.fejl || 'Kunne ikke gemme vareomkostningen.'); return }
    await beregn()   // genberegn med den nye omkostning
    setBusy(false)
  }

  const linjeStil = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '3px 0' }
  const mangler = Array.isArray(data?.mangler) ? data.mangler : []
  const dbKlar = data && data.daekningsbidrag != null

  return (
    <div style={SEKTION_STIL}>
      <div style={SEKTION_TITEL}>Økonomi / dækningsbidrag</div>

      {loading && <div style={{ color: c.sub, fontSize: 14 }}>Beregner …</div>}
      {fejl && <div style={{ color: c.red, fontSize: 13, whiteSpace: 'pre-wrap' }}>{fejl}</div>}

      {!loading && !fejl && data && (
        <>
          <div style={linjeStil}>
            <span style={{ color: c.sub }}>Pris (ex moms)</span>
            <span style={{ fontWeight: 600 }}>{fmtKr(data.pris_ex_moms)}</span>
          </div>
          <div style={linjeStil}>
            <span style={{ color: c.sub }}>− Løn</span>
            <span style={{ fontWeight: 600 }}>{fmtKr(data.loenomkostning)}</span>
          </div>
          <div style={linjeStil}>
            <span style={{ color: c.sub }}>− Vareomkostning</span>
            <span style={{ fontWeight: 600 }}>{fmtKr(data.vareomkostning)}</span>
          </div>
          <div style={{ ...linjeStil, borderTop: `1px solid ${c.line}`, marginTop: 4, paddingTop: 8 }}>
            <span style={{ fontWeight: 700 }}>= Dækningsbidrag</span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 800, color: dbKlar && data.daekningsbidrag < 0 ? c.red : c.ink }}>
                {fmtKr(data.daekningsbidrag)}
              </span>
              {dbKlar && (data.daekningsgrad_pct != null || data.db_pr_gaest != null) && (
                <span style={{ fontSize: 12.5, color: gradFarve(data.daekningsgrad_pct), marginLeft: 6 }}>
                  ({[fmtPct(data.daekningsgrad_pct), data.db_pr_gaest != null ? `${Number(data.db_pr_gaest).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr/gæst` : null].filter(Boolean).join(' · ')})
                </span>
              )}
            </span>
          </div>

          {/* Systemets aerlige besked naar tallet ikke er fuldt endnu — aldrig et falsk 0. */}
          {data.note && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: 9, fontSize: 13 }}>
              {data.note}
            </div>
          )}
          {!data.note && mangler.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: 9, fontSize: 13 }}>
              Mangler: {mangler.join(', ')} — dækningsbidraget kan ikke beregnes endnu.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input
              style={{ ...input, marginBottom: 0, padding: '8px 10px', flex: 1, minWidth: 0 }}
              value={vareInput}
              onChange={(e) => setVareInput(e.target.value)}
              placeholder="Vareomkostning i kr (ex moms), fx 7000"
              inputMode="decimal"
            />
            <button style={{ ...btn, padding: '8px 14px', opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={gemVareomkostning}>
              {busy ? 'Gemmer …' : 'Gem'}
            </button>
          </div>
          {saetFejl && <div style={{ marginTop: 8, fontSize: 13, color: c.red, whiteSpace: 'pre-wrap' }}>{saetFejl}</div>}
        </>
      )}
    </div>
  )
}

function FilterPill({ aktiv, onClick, tekst, farve }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1.5px solid ${aktiv ? (farve ? farve.border : c.ink) : c.line}`,
        background: aktiv ? (farve ? farve.background : c.ink) : c.card,
        color: aktiv ? (farve ? farve.color : '#fff') : c.slate2,
        borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font,
        display: 'inline-flex', alignItems: 'center', gap: 7,
      }}
    >
      {farve && <span style={{ width: 9, height: 9, borderRadius: 5, background: farve.border }} />}
      {tekst}
    </button>
  )
}

// Felt-navne fra admin_booking_gem's `mangler` -> dansk visning.
const MANGLER_DA = {
  name: 'navn', email: 'email', phone: 'telefon', company: 'firma', type: 'kundetype',
  event_date: 'dato', food_type: 'mad', covers: 'kuverter', staff_required: 'medarbejdere',
  total_price: 'pris', enhed_id: 'enhed', info: 'info',
}

function AdminKalender() {
  const [data, setData] = useState(null)
  const [enheder, setEnheder] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('alle')   // 'alle' | enhed-id
  const [form, setForm] = useState(null)         // null | { booking: raa booking | null }
  const [gemt, setGemt] = useState(null)         // kvittering efter gem: { mangler: [] }
  const [enhedFejl, setEnhedFejl] = useState('')

  // Sekvens-token: load() kaldes fra mount, vagt-handlinger og gem, saa et
  // out-of-order svar ikke maa overskrive friskere data med et aeldre snapshot.
  const loadSeq = useRef(0)

  // Reloads roerer ikke `loading` (kun foerste hentning), saa modalen ikke flimrer.
  const load = useCallback(() => {
    setErr('')
    const seq = ++loadSeq.current
    supabase.rpc('kalender_data').then(({ data, error }) => {
      if (seq !== loadSeq.current) return
      setLoading(false)
      if (error) { setErr(error.message); return }
      if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente kalenderen.'); return }
      const friske = data.bookinger || []
      setData(friske)
      // Opdater en aaben booking-detalje med friske data (bl.a. "Personale:" i
      // beskrivelsen), saa vagt-aendringer afspejles med det samme uden genaabning.
      setSelected((prev) => (prev ? friske.find((b) => b.booking_id === prev.booking_id) || prev : prev))
    })
  }, [])

  const hentEnheder = useCallback(() => {
    supabase.rpc('enheder_liste').then(({ data, error }) => {
      if (!error && Array.isArray(data)) { setEnheder(data); setEnhedFejl('') }
      else setEnhedFejl('Enheder kunne ikke hentes — enhedsfilter og enhedsvalg er midlertidigt utilgængelige.')
    })
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { hentEnheder() }, [hentEnheder])

  const farver = useMemo(() => byggeEnhedFarver(enheder), [enheder])
  const valgtEnhed = filter === 'alle' ? null : (enheder.find((e) => e.id === filter) || null)
  const synlige = useMemo(
    () => (data || []).filter((b) => !valgtEnhed || b.enhed === valgtEnhed.navn),
    [data, valgtEnhed],
  )

  const events = useMemo(() => synlige.map((b) => {
    const start = new Date(b.start)
    return {
      key: b.booking_id,
      start,
      chip: { tid: fmtTid(start), label: renTitel(b.titel), tone: b.aflyst ? 'slate' : (farver.get(b.enhed) || UDEN_ENHED_FARVE), struck: b.aflyst },
      raw: b,
    }
  }), [synlige, farver])

  const iVisning = synlige.filter((b) => iMaaned(new Date(b.start), cursor)).length
  const harUdenEnhed = (data || []).some((b) => !b.aflyst && !b.enhed)

  function bookingGemt(res) {
    setForm(null)
    setGemt({ mangler: Array.isArray(res?.mangler) ? res.mangler : [] })
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Kalender</h1>
        {data && <span style={{ color: c.sub, fontSize: 14 }}>{iVisning} booking{iVisning === 1 ? '' : 'er'} denne måned</span>}
        <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => { setGemt(null); setForm({ booking: null }) }}>+ Ny booking</button>
      </div>
      <p style={{ color: c.sub, margin: '6px 0 0' }}>Overblik over bookinger. Klik en booking for detaljer — eller opret en ny.</p>

      {enhedFejl && (
        <div style={{ ...card, marginTop: 14, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>{enhedFejl}</span>
          <button style={{ ...btnGhost, padding: '6px 12px', fontSize: 13 }} onClick={hentEnheder}>Prøv igen</button>
        </div>
      )}

      {enheder.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <FilterPill aktiv={filter === 'alle'} onClick={() => setFilter('alle')} tekst="Alle" />
          {enheder.map((e) => (
            <FilterPill key={e.id} aktiv={filter === e.id} onClick={() => setFilter(e.id)} tekst={e.navn} farve={farver.get(e.navn)} />
          ))}
        </div>
      )}

      {gemt && (
        <div style={{ ...card, marginTop: 16, background: '#DCFCE7', border: '1px solid #86EFAC', color: '#166534', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span>
            Booking gemt ✓
            {gemt.mangler.length > 0 && ` — mangler stadig: ${gemt.mangler.map((m) => MANGLER_DA[m] || m).join(', ')}`}
          </span>
          <button onClick={() => setGemt(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter kalenderen …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>Fejl: {err}</div>}

      {!loading && !err && data && (
        <>
          <MaanedsGrid cursor={cursor} onCursor={setCursor} events={events} onSelect={setSelected} />
          <Legend
            items={[
              ...enheder.map((e) => ({ tone: farver.get(e.navn), tekst: e.navn })),
              ...(harUdenEnhed ? [{ tone: UDEN_ENHED_FARVE, tekst: 'Uden enhed' }] : []),
              { tone: 'slate', tekst: 'Aflyst' },
            ]}
          />
        </>
      )}

      {selected && (
        <BookingDetalje
          booking={selected}
          enhedFarve={farver.get(selected.enhed)}
          onClose={() => setSelected(null)}
          onVagtChange={load}
          onRediger={() => { setGemt(null); setForm({ booking: selected }); setSelected(null) }}
        />
      )}
      {form && (
        <BookingForm
          enheder={enheder}
          booking={form.booking}
          onClose={() => setForm(null)}
          onSaved={bookingGemt}
        />
      )}
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
        {vagt.enhed && <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Enhed:</span><span style={{ fontWeight: 600 }}> {vagt.enhed}{vagt.enhed_type ? ` (${vagt.enhed_type})` : ''}</span></div>}
        <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Koncept:</span><span style={{ fontWeight: 600 }}> {vagt.koncept}</span></div>
        <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Kuverter:</span><span style={{ fontWeight: 600 }}> {vagt.covers}</span></div>
        <div style={{ fontSize: 14 }}><span style={{ color: c.sub }}>Status:</span><span style={{ fontWeight: 600 }}> {vagt.status === 'bekraeftet' ? 'bekræftet' : 'tildelt'}</span></div>
      </div>
      <InfoBoks tekst={vagt.info} />
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

  // Ledigheds-formular
  const [dato, setDato] = useState('')
  const [fraTid, setFraTid] = useState('')
  const [tilTid, setTilTid] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null) // null | 'meld' | <availability-id>
  const [handlingFejl, setHandlingFejl] = useState('')

  // Vagt-handlinger (tag / bekræft / meld fra) — egen laase- og fejl-state.
  const [vagtBusy, setVagtBusy] = useState(null) // shift_id under handling
  const [vagtFejl, setVagtFejl] = useState('')

  // Reloads roerer ikke `loading` (kun foerste hentning), saa formularen ikke flimrer.
  const load = useCallback(async () => {
    setErr('')
    const { data: res, error } = await supabase.rpc('medarbejder_kalender')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!res || res.ok === false) { setErr(res?.fejl || 'Kunne ikke hente din kalender.'); return }
    setData(res)
  }, [])

  useEffect(() => { load() }, [load])

  async function meldLedig() {
    if (!dato) { setHandlingFejl('Vælg en dato.'); return }
    setBusy('meld'); setHandlingFejl('')
    const { data: res, error } = await supabase.rpc('medarbejder_handling', {
      p_aktion: 'meld_ledig',
      p_payload: { dato, fra_tid: fraTid || null, til_tid: tilTid || null, note: note.trim() || null },
    })
    if (error) { setBusy(null); setHandlingFejl('Fejl: ' + error.message); return }
    if (!res || res.ok === false) { setBusy(null); setHandlingFejl(res?.fejl || 'Kunne ikke melde ledig.'); return }
    setFraTid(''); setTilTid(''); setNote('')
    await load()
    setBusy(null)
  }

  async function fjernLedig(id) {
    setBusy(id); setHandlingFejl('')
    const { data: res, error } = await supabase.rpc('medarbejder_handling', {
      p_aktion: 'fjern_ledig',
      p_payload: { id },
    })
    if (error) { setBusy(null); setHandlingFejl('Fejl: ' + error.message); return }
    if (!res || res.ok === false) { setBusy(null); setHandlingFejl(res?.fejl || 'Kunne ikke fjerne ledigheden.'); return }
    await load()
    setBusy(null)
  }

  async function vagtHandling(aktion, shiftId) {
    setVagtBusy(shiftId); setVagtFejl('')
    const { data: res, error } = await supabase.rpc('medarbejder_handling', {
      p_aktion: aktion,
      p_payload: { shift_id: shiftId },
    })
    if (error) { setVagtBusy(null); setVagtFejl('Fejl: ' + error.message); return }
    if (!res || res.ok === false) { setVagtBusy(null); setVagtFejl(res?.fejl || 'Handlingen fejlede.'); return }
    await load()
    setVagtBusy(null)
  }

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
          <MaanedsGrid cursor={cursor} onCursor={setCursor} events={events} onSelect={setSelected} onDayClick={(d) => setDato(toISODate(d))} />
          <Legend items={[{ tone: 'green', tekst: 'Bekræftet' }, { tone: 'blue', tekst: 'Tildelt' }]} />

          <div style={{ display: 'flex', gap: 20, marginTop: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <MiniListe
              titel="Åbne vagter"
              tom={aabne.length === 0 ? 'Ingen åbne vagter lige nu.' : null}
            >
              {aabne.map((v) => (
                <div key={v.shift_id} style={{ padding: '12px 16px', borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v.koncept}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2, textTransform: 'capitalize' }}>{fmtDatoKort(new Date(v.dato))}</div>
                    <EnhedInfoLinje enhed={v.enhed} info={v.info} />
                  </div>
                  <div style={{ fontSize: 13, color: c.slate2 }}>{v.covers} kuverter</div>
                  <button
                    style={{ ...btn, padding: '8px 12px', opacity: vagtBusy ? 0.6 : 1 }}
                    disabled={!!vagtBusy}
                    onClick={() => vagtHandling('vagt_tag', v.shift_id)}
                  >
                    {vagtBusy === v.shift_id ? '…' : 'Tag vagt'}
                  </button>
                </div>
              ))}
            </MiniListe>

            <MiniListe
              titel="Mine vagter"
              tom={vagter.length === 0 ? 'Ingen tildelte vagter endnu.' : null}
            >
              {vagter.map((v) => (
                <div key={v.shift_id} style={{ padding: '12px 16px', borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v.koncept}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2, textTransform: 'capitalize' }}>{fmtDatoKort(new Date(v.dato))}</div>
                    <EnhedInfoLinje enhed={v.enhed} info={v.info} />
                  </div>
                  <VagtBadge status={v.status} />
                  {v.status === 'tildelt' && (
                    <button
                      style={{ ...btn, padding: '8px 12px', opacity: vagtBusy ? 0.6 : 1 }}
                      disabled={!!vagtBusy}
                      onClick={() => vagtHandling('vagt_accepter', v.shift_id)}
                    >
                      {vagtBusy === v.shift_id ? '…' : 'Bekræft'}
                    </button>
                  )}
                  <button
                    style={{ ...btnGhost, padding: '8px 12px', color: c.red, opacity: vagtBusy ? 0.6 : 1 }}
                    disabled={!!vagtBusy}
                    onClick={() => vagtHandling('vagt_afmeld', v.shift_id)}
                  >
                    {vagtBusy === v.shift_id ? '…' : 'Meld fra'}
                  </button>
                </div>
              ))}
            </MiniListe>

            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 }}>Min ledighed</div>
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Meld dig ledig</div>
                  <input type="date" style={input} value={dato} onChange={(e) => setDato(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, fontSize: 11, color: c.sub }}>Fra (valgfri)</div>
                    <div style={{ flex: 1, fontSize: 11, color: c.sub }}>Til (valgfri)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="time" style={{ ...input, flex: 1 }} value={fraTid} onChange={(e) => setFraTid(e.target.value)} />
                    <input type="time" style={{ ...input, flex: 1 }} value={tilTid} onChange={(e) => setTilTid(e.target.value)} />
                  </div>
                  <div style={{ fontSize: 11, color: c.sub, margin: '-4px 0 10px' }}>Tom tid = ledig hele dagen. Tip: klik en dag i kalenderen for at vælge dato.</div>
                  <input type="text" style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (valgfrit)" />
                  <button style={{ ...btn, width: '100%', opacity: busy ? 0.6 : 1 }} onClick={meldLedig} disabled={!!busy}>
                    {busy === 'meld' ? 'Melder …' : 'Meld ledig'}
                  </button>
                  {handlingFejl && <div style={{ marginTop: 10, fontSize: 13, color: c.red }}>{handlingFejl}</div>}
                </div>

                {ledighed.length === 0 ? (
                  <div style={{ padding: '14px 16px', color: c.sub, fontSize: 14, borderTop: `1px solid ${c.line}` }}>Ingen registreret ledighed endnu.</div>
                ) : ledighed.map((l) => {
                  const interval = l.fra_tid && l.til_tid ? `${fmtKlokke(l.fra_tid)}–${fmtKlokke(l.til_tid)}` : (l.fra_tid ? `fra ${fmtKlokke(l.fra_tid)}` : '')
                  return (
                    <div key={l.id} style={{ padding: '12px 16px', borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{fmtDatoKort(new Date(l.dato))}</div>
                          {interval && <div style={{ fontSize: 13, color: c.slate2 }}>{interval}</div>}
                        </div>
                        {l.note && <div style={{ fontSize: 13, color: c.sub, marginTop: 3 }}>{l.note}</div>}
                      </div>
                      <button style={{ ...btnGhost, padding: '7px 12px', opacity: busy ? 0.6 : 1 }} onClick={() => fjernLedig(l.id)} disabled={!!busy}>
                        {busy === l.id ? 'Fjerner …' : 'Fjern'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {vagtFejl && <div style={{ marginTop: 14, fontSize: 13, color: c.red }}>{vagtFejl}</div>}
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
