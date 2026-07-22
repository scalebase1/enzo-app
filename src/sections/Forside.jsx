import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, SUPABASE_ANON } from '../supabaseClient.js'
import { useGenindlaes } from '../hooks.js'
import { c, card, btn, input, font, sp, tone } from '../ui.js'
import { PROXY as ENZO_CHAT } from './Enzo.jsx'
import { BookingDetalje, byggeEnhedFarver } from './Kalender.jsx'
import { StatusChip } from '../komponenter/index.jsx'

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

// Lokale chips bruger nu det faelles komponent + tone-tokens.
function Chip({ tekst, farve }) {
  return <StatusChip tekst={tekst} farve={farve || tone.neutral} />
}

// bemanding kommer som "bekraeftede/behov", fx "0/2".
function BemandingChip({ bemanding }) {
  if (!bemanding) return null
  const [a, b] = String(bemanding).split('/').map((n) => Number(n))
  const fuldt = Number.isFinite(a) && Number.isFinite(b) && a >= b
  return <Chip tekst={`${bemanding} bemandet`} farve={fuldt ? tone.ok : tone.advarsel} />
}

function Koncepter({ liste }) {
  const arr = Array.isArray(liste) ? liste.filter(Boolean) : []
  if (arr.length === 0) return null
  return <>{arr.map((k) => <Chip key={k} tekst={k} />)}</>
}

function Noegletal({ label, value, fremhaev, maal }) {
  const nav = useNavigate()
  const klikbar = !!maal && Number(value) > 0
  return (
    <div
      onClick={klikbar ? () => nav(maal) : undefined}
      role={klikbar ? 'button' : undefined}
      tabIndex={klikbar ? 0 : undefined}
      onKeyDown={klikbar ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(maal) } } : undefined}
      style={{
        ...card, padding: '14px 16px', minHeight: 44,
        cursor: klikbar ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 13, color: c.sub }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: fremhaev ? c.amber : c.ink }}>{value}</div>
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
    <div style={{ padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: 12, color: c.sub, fontSize: 15, background: c.card }}>
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
    // 60s, ikke 30: et statusspoergsmaal tager ~31s maalt i produktion
    // (Enzo kalder hent_status og skriver derefter et fuldt overblik).
    // 30s afbroed svaret MENS det var paa vej — det var fejlen William saa.
    const t30 = setTimeout(() => ctrl.abort(), 60000)
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
      setFejl(er && er.name === 'AbortError' ? 'Enzo nåede ikke at svare færdig. Tjek panelet — forslag hun nåede at lave ligger klar. Spørg gerne om én ting ad gangen.' : 'Uventet fejl — prøv igen.')
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: c.sub, fontWeight: 500, marginBottom: 10 }}>Spørg Enzo</div>
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

// hub_indbakke-poster -> hvor foerer de hen. Hver posttype SKAL have en
// destination: en post man ikke kan klikke paa er en paamindelse uden udvej.
const HUB_MAAL = {
  kladde: '/kundekontakt?fane=kladder',
  lead_ny: '/kundekontakt?fane=henvendelser',
  lead_kold: '/kundekontakt?fane=henvendelser',
  booking_ny: '/kalender',
  booking_ubemandet: '/kalender',
  driftsdag_ubemandet: '/vogndrift',
  timer_mangler_booking: '/loen',
  timer_mangler_drift: '/vogndrift',
  faktura_forfalden: '/fakturaer',
  faktura_mangler: '/fakturaer',
}

function FraEnzo({ onAntal }) {
  const nav = useNavigate()
  const [poster, setPoster] = useState(null)
  const [fejl, setFejl] = useState('')

  // Traukket ud af useEffect, saa den kan kaldes igen naar fanen faar fokus.
  // Indbakken er det sted tre chefer hurtigst kommer ud af sync: en post kan
  // vaere handlet af en anden for et minut siden.
  const hentIndbakke = useCallback(() => {
    supabase.rpc('hub_indbakke').then(({ data, error }) => {
      if (error) { setFejl(error.message); return }
      if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke hente indbakken.'); return }
      setPoster((data.poster || []).slice(0, 5))
      // Loeftes op til forsiden, saa noegletallene deler dette kald i stedet for
      // at hente hub_indbakke en gang til.
      if (onAntal && data.antal) onAntal(data.antal)
    })
  }, [onAntal])

  useEffect(() => { hentIndbakke() }, [hentIndbakke])
  useGenindlaes(hentIndbakke)

  return (
    <div style={{ ...card, marginTop: sp(4) }}>
      <div style={{ fontSize: 13, color: c.sub, fontWeight: 500, marginBottom: 10 }}>Fra Enzo</div>
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
              <div style={{ fontSize: 14, fontWeight: 500, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.titel}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: c.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.undertekst}
            </div>
            {p.handling && <div style={{ fontSize: 12, color: haster ? c.red : c.slate2, fontWeight: 500, marginTop: 3 }}>{p.handling}</div>}
          </div>
        )
      })}
    </div>
  )
}

function AdminForside({ data, smal, onDataAendret }) {
  const arrangementer = Array.isArray(data.naeste_arrangementer) ? data.naeste_arrangementer : []

  // Tallene kommer fra hub_indbakke (loeftet op fra FraEnzo), IKKE fra
  // forside_data.skal_handles. To konkurrerende taellinger af "hvad skal jeg
  // goere nu" var praecis det problem der gav ét udifferentieret tal paa 16.
  const [antal, setAntal] = useState(null)
  const paaAntal = useCallback((a) => setAntal(a), [])

  const grupper = antal ? [
    { label: 'Bemanding', value: Number(antal.bemanding || 0), maal: '/vogndrift' },
    { label: 'Svar kunder', value: Number(antal.svar_kunder || 0), maal: '/kundekontakt' },
    { label: 'Timer', value: Number(antal.timer || 0), maal: '/loen' },
    { label: 'Fakturaer', value: Number(antal.fakturaer || 0), maal: '/fakturaer' },
  ] : []
  const skal = grupper.reduce((s, g) => s + g.value, 0)

  // Bookingdetaljen er den samme komponent som i Kalender, og den kraever et
  // kalender_bookinger-formet objekt. forside_data giver kun et uddrag, saa vi
  // henter den rigtige raekke paa booking_id naar der klikkes.
  const [valgt, setValgt] = useState(null)      // kalender-formet booking
  const [farver, setFarver] = useState(() => new Map())
  const [aabnerId, setAabnerId] = useState(null)
  const [aabnFejl, setAabnFejl] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('enheder_liste').then(({ data: d, error }) => {
      if (!alive || error || !Array.isArray(d)) return
      setFarver(byggeEnhedFarver(d))
    })
    return () => { alive = false }
  }, [])

  async function aabn(bookingId) {
    if (aabnerId) return
    setAabnerId(bookingId); setAabnFejl('')
    const { data: d, error } = await supabase.rpc('kalender_data')
    setAabnerId(null)
    if (error) { setAabnFejl(error.message); return }
    if (!d || d.ok === false) { setAabnFejl(d?.fejl || 'Kunne ikke hente bookingen.'); return }
    const b = (d.bookinger || []).find((x) => x.booking_id === bookingId)
    if (!b) { setAabnFejl('Bookingen blev ikke fundet i kalenderen.'); return }
    setValgt(b)
  }

  const midte = (
    <div>
      <Hilsen
        navn={data.navn}
        undertekst={
          antal === null ? data.maaned
            : skal > 0 ? `${data.maaned} — ${skal} ting kræver din handling`
            : `${data.maaned} — alt er fulgt op`
        }
      />

      {/* Fire grupper frem for ét tal. Et samlet "16" fortaeller hvor meget der
          venter, men ikke hvad — og saa skal William alligevel lede. Hver gruppe
          foerer direkte til den sektion hvor arbejdet ligger.
          Maanedens omsaetning er flyttet til Rapporter: den er en observation,
          og forsiden skal pege mod handling. */}
      <div style={{ display: 'grid', gridTemplateColumns: smal ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: sp(3) }}>
        {grupper.map((g) => (
          <Noegletal key={g.label} label={g.label} value={g.value} fremhaev={g.value > 0} maal={g.maal} />
        ))}
        {antal === null && <Noegletal label="Skal handles" value="…" />}
      </div>

      <div style={{ marginTop: sp(6) }}>
        <div style={{ fontSize: 13, color: c.sub, fontWeight: 500, marginBottom: 10 }}>Næste arrangementer</div>
        {aabnFejl && <div style={{ fontSize: 13, color: c.red, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{aabnFejl}</div>}
        {arrangementer.length === 0 ? (
          <Tom tekst="Ingen kommende arrangementer." />
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {arrangementer.map((a, i) => (
              <button
                key={a.booking_id}
                onClick={() => aabn(a.booking_id)}
                disabled={!!aabnerId}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', background: 'transparent', fontFamily: font,
                  cursor: 'pointer', display: 'block', padding: '14px 16px', minHeight: 44,
                  borderTop: i > 0 ? `1px solid ${c.line}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: c.ink }}>{a.kunde}</div>
                  <div style={{ fontSize: 13, color: c.slate2 }}>{fmtDatoTid(a.dato)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: c.sub }}>{a.kuverter != null ? `${a.kuverter} kuverter` : '—'}</span>
                  <Koncepter liste={a.koncepter} />
                  <BemandingChip bemanding={a.bemanding} />
                  <StatusChip status={a.status} tekst={a.status_tekst} />
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
      <FraEnzo onAntal={paaAntal} />
    </div>
  )

  // Den eksisterende bookingdetalje fra Kalender — samme komponent, samme logik.
  const modal = valgt && (
    <BookingDetalje
      booking={valgt}
      enhedFarve={farver.get(valgt.enhed)}
      onClose={() => setValgt(null)}
      onVagtChange={onDataAendret}
    />
  )

  // Mobil: Enzo-panelet nederst. Desktop: hoejrespalte paa ca. 280px.
  if (smal) {
    return <div>{midte}<div style={{ marginTop: sp(6) }}>{hoejre}</div>{modal}</div>
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: sp(6), alignItems: 'start' }}>
        {midte}
        {hoejre}
      </div>
      {modal}
    </>
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
        <div style={{ fontSize: 13, color: c.sub, fontWeight: 500, marginBottom: 10 }}>Mine næste vagter</div>
        {vagter.length === 0 ? (
          <Tom tekst="Du har ingen kommende vagter." />
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {vagter.map((v, i) => (
              <div key={`${v.type}-${v.id}`} style={{ padding: '14px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: c.ink }}>{v.titel}</div>
                  <div style={{ fontSize: 13, color: c.slate2 }}>{v.type === 'vogndrift' ? fmtDato(v.dato) : fmtDatoTid(v.dato)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Chip
                    tekst={v.type === 'vogndrift' ? 'Vogndrift' : 'Arrangement'}
                    farve={v.type === 'vogndrift' ? tone.neutral : tone.aktiv}
                  />
                  {v.undertekst && <span style={{ fontSize: 13, color: c.sub }}>{v.undertekst}</span>}
                  <Koncepter liste={v.koncepter} />
                  <StatusChip status={v.status} tekst={v.status_tekst} />
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
    ? <AdminForside data={data} smal={smal} onDataAendret={load} />
    : <MedarbejderForside data={data} smal={smal} />
}
