import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, input, font, sp } from '../ui.js'

// Dansk beloeb: 180200 -> "180.200 kr". Tomt/ugyldigt -> "0 kr".
const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const fmtDato = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}

function LoyalBadge() {
  return (
    <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      ★ Loyal
    </span>
  )
}

function TypeBadge({ type }) {
  const virk = type === 'virksomhed'
  return (
    <span style={{ background: virk ? '#E8F0FE' : '#F1F5F9', color: virk ? '#1E3A8A' : c.slate2, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
      {virk ? 'Virksomhed' : 'Privat'}
    </span>
  )
}

function StatusPill({ status }) {
  const map = {
    bekraeftet: { bg: '#DCFCE7', col: '#166534', txt: 'bekræftet' },
    lukket: { bg: '#DCFCE7', col: '#166534', txt: 'lukket' },
    klar_til_bekraeftelse: { bg: '#FEF3C7', col: '#92400E', txt: 'afventer' },
    aflyst: { bg: '#FEE2E2', col: '#991B1B', txt: 'aflyst' },
  }
  const s = map[status] || { bg: '#E5E7EB', col: '#4B5563', txt: status || '—' }
  return <span style={{ background: s.bg, color: s.col, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{s.txt}</span>
}

function Noegletal({ label, value }) {
  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  )
}

// koncept-feltet ér enheden (Casanova/The Blue Pearl/...) — vises som "Enhed".
function BookingListe({ titel, rows, tom }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 }}>{titel}</div>
      {(!rows || rows.length === 0) ? (
        <div style={{ padding: '14px 16px', border: `1.5px dashed ${c.line}`, borderRadius: 12, color: c.slate2, fontSize: 14 }}>{tom}</div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {rows.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 120, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDato(b.dato)}</div>
                <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>
                  <span style={{ color: c.slate2, fontWeight: 600 }}>Enhed:</span> {b.koncept || '—'}
                </div>
              </div>
              <div style={{ fontSize: 13, color: c.slate2, minWidth: 74, textAlign: 'right' }}>{b.covers != null ? `${b.covers} kuv.` : '—'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{kr(b.beloeb)}</div>
              <StatusPill status={b.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KundeProfil({ kunde, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50, fontFamily: font }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 600, maxWidth: '100%', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.ink, overflowWrap: 'anywhere' }}>{kunde.navn}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <TypeBadge type={kunde.type} />
              {kunde.loyal && <LoyalBadge />}
              {kunde.firma && <span style={{ fontSize: 13, color: c.sub }}>{kunde.firma}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: 'pointer', padding: 0 }}>×</button>
        </div>

        {/* Noegletal */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: sp(2), marginTop: 18 }}>
          <Noegletal label="Omsætning total" value={kr(kunde.omsaetning_total)} />
          <Noegletal label="Antal events" value={kunde.antal_events ?? 0} />
          <Noegletal label="Næste event" value={fmtDato(kunde.naeste_event)} />
          <Noegletal label="Sidste event" value={fmtDato(kunde.sidste_event)} />
        </div>

        {/* Kontakt */}
        <div style={{ marginTop: 18, borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Kontakt</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Kontaktlinje label="Email" value={kunde.email} />
            <Kontaktlinje label="Telefon" value={kunde.telefon} />
            <Kontaktlinje label="Adresse" value={kunde.adresse} />
            <Kontaktlinje label="Oprettet" value={fmtDato(kunde.oprettet)} />
            {kunde.noter && (
              <div style={{ marginTop: 4, padding: '10px 14px', background: c.bg, borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>Noter</div>
                <div style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>{kunde.noter}</div>
              </div>
            )}
          </div>
        </div>

        <BookingListe titel="Kommende bookinger" rows={kunde.kommende} tom="Ingen kommende bookinger." />
        <BookingListe titel="Tidligere bookinger" rows={kunde.tidligere} tom="Ingen tidligere bookinger." />
      </div>
    </div>
  )
}

function Kontaktlinje({ label, value }) {
  return (
    <div style={{ fontSize: 14, display: 'flex', gap: 8 }}>
      <span style={{ color: c.sub, minWidth: 72 }}>{label}</span>
      <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value || '—'}</span>
    </div>
  )
}

function KundeKort({ kunde, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...card, textAlign: 'left', cursor: 'pointer', fontFamily: font, display: 'flex', flexDirection: 'column', gap: 0,
        borderLeft: kunde.loyal ? `4px solid ${c.blue}` : `1px solid ${c.line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kunde.navn}</div>
          {kunde.firma && <div style={{ fontSize: 13, color: c.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kunde.firma}</div>}
        </div>
        {kunde.loyal && <LoyalBadge />}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{kr(kunde.omsaetning_total)}</div>
        <div style={{ fontSize: 13, color: c.slate2 }}>{kunde.antal_events ?? 0} event{kunde.antal_events === 1 ? '' : 's'}</div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.line}`, fontSize: 12.5 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: c.sub }}>Næste</div>
          <div style={{ fontWeight: 600 }}>{fmtDato(kunde.naeste_event)}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: c.sub }}>Sidste</div>
          <div style={{ fontWeight: 600 }}>{fmtDato(kunde.sidste_event)}</div>
        </div>
      </div>
    </button>
  )
}

export default function Kunder() {
  const [kunder, setKunder] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [soeg, setSoeg] = useState('')
  const [valgt, setValgt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('crm_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente kunder.'); return }
    setKunder(data.kunder || [])
  }, [])

  useEffect(() => { load() }, [load])

  // Sorteret efter omsaetning (hoejeste foerst), filtreret paa navn/firma.
  const synlige = useMemo(() => {
    const q = soeg.trim().toLowerCase()
    return (kunder || [])
      .filter((k) => !q || (k.navn || '').toLowerCase().includes(q) || (k.firma || '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (b.omsaetning_total || 0) - (a.omsaetning_total || 0))
  }, [kunder, soeg])

  const total = kunder?.length ?? 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Kunder</h1>
        {kunder && <span style={{ color: c.sub, fontSize: 14 }}>{total} kunde{total === 1 ? '' : 'r'}</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Kundeoverblik (CRM). Klik en kunde for fuld profil, bookinger og hvilke enheder de booker.</p>

      {!loading && !err && kunder && total > 0 && (
        <input
          style={{ ...input, maxWidth: 340, marginTop: 6 }}
          value={soeg}
          onChange={(e) => setSoeg(e.target.value)}
          placeholder="Søg på navn eller firma …"
        />
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter kunder …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && kunder && (
        total === 0 ? (
          <div style={{ ...card, marginTop: 16, color: c.sub }}>Ingen kunder endnu.</div>
        ) : synlige.length === 0 ? (
          <div style={{ ...card, marginTop: 16, color: c.sub }}>Ingen kunder matcher “{soeg}”.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: sp(4), marginTop: 16 }}>
            {synlige.map((k) => (
              <KundeKort key={k.id} kunde={k} onClick={() => setValgt(k)} />
            ))}
          </div>
        )
      )}

      {valgt && <KundeProfil kunde={valgt} onClose={() => setValgt(null)} />}
    </div>
  )
}
