import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, SUPABASE_ANON } from '../supabaseClient.js'
import { c, card, btn, input, font, sp } from '../ui.js'

// Samme edge-funktion som Enzo-sektionen bruger. Defineret her (og ikke
// importeret) fordi Enzo.jsx ikke eksporterer den — vi roerer ikke den sektion.
const ENZO_CHAT = 'https://vakumjnnmfyqkcoxqcra.supabase.co/functions/v1/enzo-chat'

const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const timer = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 1 })} t`
const fmtDato = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })
}
const fmtDatoTid = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  const dag = d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })
  const harTid = d.getHours() !== 0 || d.getMinutes() !== 0
  return harTid ? `${dag} kl. ${d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}` : dag
}

// Mobil: spalterne stables. Inline styles kan ikke media queries.
function useSmalSkaerm(bred = 899) {
  const [smal, setSmal] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${bred}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bred}px)`)
    const h = (e) => setSmal(e.matches)
    setSmal(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [bred])
  return smal
}

function Chip({ tekst, bg, col }) {
  return (
    <span style={{ background: bg || '#F1F5F9', color: col || c.slate2, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {tekst}
    </span>
  )
}

const STATUS_STIL = {
  bekraeftet: { bg: '#DCFCE7', col: '#166534' },
  lukket: { bg: '#DCFCE7', col: '#166534' },
  klar_til_bekraeftelse: { bg: '#FEF3C7', col: '#92400E' },
  tildelt: { bg: '#E8F0FE', col: '#1E3A8A' },
  ny: { bg: '#FEF3C7', col: '#92400E' },
  aflyst: { bg: '#FEE2E2', col: '#991B1B' },
}
function StatusChip({ status }) {
  if (!status) return null
  const s = STATUS_STIL[status] || { bg: '#E5E7EB', col: '#4B5563' }
  return <Chip tekst={String(status).replace(/_/g, ' ')} bg={s.bg} col={s.col} />
}

// bemanding kommer som "bekraeftede/behov", fx "0/2".
function BemandingChip({ bemanding }) {
  if (!bemanding) return null
  const [a, b] = String(bemanding).split('/').map((n) => Number(n))
  const fuldt = Number.isFinite(a) && Number.isFinite(b) && a >= b
  return <Chip tekst={`${bemanding} bemandet`} bg={fuldt ? '#DCFCE7' : '#FEF3C7'} col={fuldt ? '#166534' : '#92400E'} />
}

function Koncepter({ liste }) {
  const arr = Array.isArray(liste) ? liste.filter(Boolean) : []
  if (arr.length === 0) return null
  return <>{arr.map((k) => <Chip key={k} tekst={k} />)}</>
}

function Noegletal({ label, value, fremhaev }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: fremhaev ? c.amber : c.ink }}>{value}</div>
    </div>
  )
}

function Hilsen({ navn, undertekst }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px', color: c.ink }}>Hej {navn || 'der'}</h1>
      <div style={{ color: c.sub, fontSize: 15 }}>{undertekst}</div>
    </div>
  )
}

function Tom({ tekst }) {
  return (
    <div style={{ padding: '16px 18px', border: `1.5px dashed ${c.line}`, borderRadius: 12, color: c.slate2, fontSize: 14 }}>
      {tekst}
    </div>
  )
}

// ---------------- Williams forside ----------------

function SpoergEnzo() {
  const nav = useNavigate()
  const [tekst, setTekst] = useState('')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  // Samme sessionId-noegle som Enzo-sektionen (enzo_session_<uid>), saa beskeden
  // lander i den samtale Enzo aabner bagefter.
  async function hentSessionId(uid) {
    const key = `enzo_session_${uid}`
    let gemt = null
    try { gemt = localStorage.getItem(key) } catch { /* ignore */ }
    if (gemt) return gemt
    const nyt = crypto.randomUUID()
    try { localStorage.setItem(key, nyt) } catch { /* ignore */ }
    return nyt
  }

  async function send() {
    const t = tekst.trim()
    if (!t || busy) return
    setBusy(true); setFejl('')

    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    const uid = sess.session?.user?.id
    if (!tok || !uid) { setBusy(false); setFejl('Session udløbet — genindlæs siden.'); return }

    const sessionId = await hentSessionId(uid)
    const ctrl = new AbortController()
    const t30 = setTimeout(() => ctrl.abort(), 30000)
    try {
      const res = await fetch(ENZO_CHAT, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatInput: t, sessionId }),
        signal: ctrl.signal,
      })
      clearTimeout(t30)
      const raw = await res.text()
      let d = null
      try { d = JSON.parse(raw) } catch { /* ignore */ }
      setBusy(false)
      if (!res.ok || !d || d.ok === false || typeof d.svar !== 'string') {
        setFejl(d && d.fejl ? 'Enzo-fejl: ' + d.fejl : 'Fejlede (' + res.status + ') — prøv igen.')
        return
      }
      setTekst('')
      nav('/enzo')
    } catch (er) {
      clearTimeout(t30); setBusy(false)
      setFejl(er && er.name === 'AbortError' ? 'Enzo svarede ikke i tide, prøv igen.' : 'Uventet fejl — prøv igen.')
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Spørg Enzo</div>
      <textarea
        style={{ ...input, marginBottom: 0, minHeight: 76, resize: 'vertical' }}
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        placeholder="Spørg om noget …"
      />
      <button
        onClick={send}
        disabled={busy || !tekst.trim()}
        style={{ ...btn, width: '100%', minHeight: 44, marginTop: 10, opacity: (busy || !tekst.trim()) ? 0.6 : 1, cursor: (busy || !tekst.trim()) ? 'default' : 'pointer' }}
      >
        {busy ? 'Sender …' : 'Spørg Enzo'}
      </button>
      {fejl && <div style={{ marginTop: 10, fontSize: 13, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>}
    </div>
  )
}

// hub_indbakke-poster -> hvor foerer de hen. 'lead_*' har ingen sektion i appen.
const HUB_MAAL = { kladde: '/kladder', booking_ny: '/kalender' }

function FraEnzo() {
  const nav = useNavigate()
  const [poster, setPoster] = useState(null)
  const [fejl, setFejl] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('hub_indbakke').then(({ data, error }) => {
      if (!alive) return
      if (error) { setFejl(error.message); return }
      if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke hente indbakken.'); return }
      setPoster((data.poster || []).slice(0, 5))
    })
    return () => { alive = false }
  }, [])

  return (
    <div style={{ ...card, marginTop: sp(4) }}>
      <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Fra Enzo</div>
      {fejl && <div style={{ fontSize: 13, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>}
      {!fejl && poster === null && <div style={{ color: c.sub, fontSize: 14 }}>Henter …</div>}
      {!fejl && poster && poster.length === 0 && <Tom tekst="Intet nyt fra Enzo." />}
      {!fejl && poster && poster.map((p, i) => {
        const maal = HUB_MAAL[p.type]
        const haster = p.hastighed === 'haster'
        return (
          <div
            key={`${p.type}-${p.id}-${i}`}
            onClick={maal ? () => nav(maal) : undefined}
            style={{
              padding: '10px 0', borderTop: i > 0 ? `1px solid ${c.line}` : 'none',
              cursor: maal ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {haster && <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.red, flexShrink: 0 }} />}
              <div style={{ fontSize: 14, fontWeight: 700, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.titel}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: c.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.undertekst}
            </div>
            {p.handling && <div style={{ fontSize: 12, color: haster ? c.red : c.slate2, fontWeight: 600, marginTop: 3 }}>{p.handling}</div>}
          </div>
        )
      })}
    </div>
  )
}

function AdminForside({ data, smal }) {
  const nav = useNavigate()
  const arrangementer = Array.isArray(data.naeste_arrangementer) ? data.naeste_arrangementer : []
  const skal = Number(data.skal_handles || 0)

  const midte = (
    <div>
      <Hilsen
        navn={data.navn}
        undertekst={skal > 0 ? `${data.maaned} — ${skal} ting kræver din handling` : data.maaned}
      />

      <div style={{ display: 'grid', gridTemplateColumns: smal ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: sp(3) }}>
        <Noegletal label="Skal handles" value={skal} fremhaev={skal > 0} />
        <Noegletal label="Månedens omsætning" value={kr(data.maanedens_omsaetning)} />
        <Noegletal label="Kommende" value={arrangementer.length} />
      </div>

      <div style={{ marginTop: sp(6) }}>
        <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Næste arrangementer</div>
        {arrangementer.length === 0 ? (
          <Tom tekst="Ingen kommende arrangementer." />
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {arrangementer.map((a, i) => (
              <button
                key={a.booking_id}
                onClick={() => nav('/kalender')}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', background: 'transparent', fontFamily: font,
                  cursor: 'pointer', display: 'block', padding: '14px 16px', minHeight: 44,
                  borderTop: i > 0 ? `1px solid ${c.line}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: c.ink }}>{a.kunde}</div>
                  <div style={{ fontSize: 13, color: c.slate2 }}>{fmtDatoTid(a.dato)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: c.sub }}>{a.kuverter != null ? `${a.kuverter} kuverter` : '—'}</span>
                  <Koncepter liste={a.koncepter} />
                  <BemandingChip bemanding={a.bemanding} />
                  <StatusChip status={a.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const hoejre = (
    <div>
      <SpoergEnzo />
      <FraEnzo />
    </div>
  )

  // Mobil: Enzo-panelet nederst. Desktop: hoejrespalte paa ca. 280px.
  if (smal) {
    return <div>{midte}<div style={{ marginTop: sp(6) }}>{hoejre}</div></div>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: sp(6), alignItems: 'start' }}>
      {midte}
      {hoejre}
    </div>
  )
}

// ---------------- Medarbejderens forside (ingen Enzo) ----------------

function MedarbejderForside({ data, smal }) {
  const vagter = Array.isArray(data.naeste_vagter) ? data.naeste_vagter : []

  return (
    <div>
      <Hilsen navn={data.navn} undertekst={data.maaned} />

      <div style={{ display: 'grid', gridTemplateColumns: smal ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: sp(3), maxWidth: smal ? undefined : 520 }}>
        <Noegletal label="Timer denne måned" value={timer(data.timer_denne_maaned)} />
        <Noegletal label="Løn denne måned" value={kr(data.loen_denne_maaned)} />
      </div>

      <div style={{ marginTop: sp(6) }}>
        <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Mine næste vagter</div>
        {vagter.length === 0 ? (
          <Tom tekst="Du har ingen kommende vagter." />
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {vagter.map((v, i) => (
              <div key={`${v.type}-${v.id}`} style={{ padding: '14px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: c.ink }}>{v.titel}</div>
                  <div style={{ fontSize: 13, color: c.slate2 }}>{v.type === 'vogndrift' ? fmtDato(v.dato) : fmtDatoTid(v.dato)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Chip
                    tekst={v.type === 'vogndrift' ? 'Vogndrift' : 'Arrangement'}
                    bg={v.type === 'vogndrift' ? '#F3E8FF' : '#E8F0FE'}
                    col={v.type === 'vogndrift' ? '#6B21A8' : '#1E3A8A'}
                  />
                  {v.undertekst && <span style={{ fontSize: 13, color: c.sub }}>{v.undertekst}</span>}
                  <Koncepter liste={v.koncepter} />
                  <StatusChip status={v.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------- Forside (ét kald, render efter rolle) ----------------

export default function Forside() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fejl, setFejl] = useState('')
  const smal = useSmalSkaerm()

  const load = useCallback(async () => {
    setLoading(true); setFejl('')
    const { data: d, error } = await supabase.rpc('forside_data')
    setLoading(false)
    if (error) { setFejl(error.message); return }
    if (!d || d.ok === false) { setFejl(d?.fejl || 'Kunne ikke hente forsiden.'); return }
    setData(d)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ ...card, color: c.sub }}>Henter …</div>
  if (fejl) return <div style={{ ...card, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>
  if (!data) return null

  return data.rolle === 'admin'
    ? <AdminForside data={data} smal={smal} />
    : <MedarbejderForside data={data} smal={smal} />
}
