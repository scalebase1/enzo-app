import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font, sp } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'
import { tone } from '../ui.js'

// Tidsstempler kommer som fuld ISO 8601 m. offset (RPC'erne koerer i Europe/Copenhagen).
const fmtTid = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Vagter kan ligge langt ude i fremtiden -> aaret med.
const fmtVagtTid = (iso) => {
  if (!iso) return 'Ukendt dato'
  const d = new Date(iso)
  return isNaN(d) ? 'Ukendt dato' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}


function UlaestBadge({ antal }) {
  return <StatusChip tekst={String(antal)} farve={{ bg: c.accent, col: '#fff' }} />
}

function BroadcastBadge() {
  return <StatusChip tekst="Flere modtagere" farve={tone.aktiv} />
}

// Williams overblik: { sendt, laest, handlet, har_handlet? }. Kun til admin.
function Kvittering({ kvittering, visNavne }) {
  if (!kvittering || !kvittering.sendt) return null
  const navne = visNavne && Array.isArray(kvittering.har_handlet) ? kvittering.har_handlet : []
  return (
    <div style={{ fontSize: 11.5, color: c.sub }}>
      Sendt til {kvittering.sendt} · læst af {kvittering.laest} · handlet {kvittering.handlet}
      {navne.length > 0 && <span style={{ color: c.green, fontWeight: 500 }}> ({navne.join(', ')})</span>}
    </div>
  )
}

// handling_tilstand afgoeres server-side: 'klar' | 'udfoert' | 'ikke_mulig' | 'admin' | null.
// Vi gaetter aldrig selv om knappen maa vaere aktiv.
function Handling({ besked, busy, onUdfoer }) {
  const t = besked.handling_tilstand
  if (!besked.handling || !t || t === 'admin') return null

  if (t === 'udfoert') {
    return <div style={{ fontSize: 12.5, fontWeight: 500, color: c.green }}>✓ Udført</div>
  }
  if (t === 'ikke_mulig') {
    return <div style={{ fontSize: 12.5, color: c.sub }}>Ikke længere mulig.</div>
  }
  // 'klar'
  return (
    <button
      onClick={() => onUdfoer(besked)}
      disabled={busy}
      style={{ ...btn, padding: '9px 14px', opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
    >
      {busy ? 'Udfører …' : (besked.handling.label || 'Udfør handling')}
    </button>
  )
}

function BeskedBoble({ besked, erAdmin, busy, fejl, onUdfoer }) {
  const mig = besked.fra_mig === true
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mig ? 'flex-end' : 'flex-start', gap: 5 }}>
      <div style={{ fontSize: 11, color: c.sub }}>{besked.afsender || '—'} · {fmtTid(besked.tidspunkt)}</div>
      <div style={{
        maxWidth: '82%', background: mig ? c.blue : '#F2F1ED', color: mig ? '#fff' : c.ink,
        padding: '10px 14px', borderRadius: 12, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {besked.tekst}
      </div>
      <Handling besked={besked} busy={busy} onUdfoer={onUdfoer} />
      {fejl && <div style={{ fontSize: 13, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>}
      {erAdmin && <Kvittering kvittering={besked.kvittering} visNavne />}
    </div>
  )
}

function TraadLinje({ traad, valgt, erAdmin, onClick }) {
  const ulaeste = traad.ulaeste || 0
  const deltagere = Array.isArray(traad.deltagere) ? traad.deltagere : []
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', fontFamily: font, cursor: 'pointer', display: 'block',
        background: valgt ? '#F2F1ED' : 'transparent', border: 'none',
        borderLeft: valgt ? `3px solid ${c.blue}` : '3px solid transparent',
        borderBottom: `1px solid ${c.line}`, padding: '12px 14px' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: ulaeste > 0 ? 500 : 400, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {traad.emne}
        </div>
        {ulaeste > 0 && <UlaestBadge antal={ulaeste} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        {traad.type === 'broadcast' && <BroadcastBadge />}
        <span style={{ fontSize: 12, color: c.slate2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deltagere.length > 0 ? deltagere.join(', ') : '—'}
        </span>
      </div>

      <div style={{
        fontSize: 12.5, color: ulaeste > 0 ? c.ink : c.sub, marginTop: 4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {traad.seneste || 'Ingen beskeder endnu.'}
      </div>

      <div style={{ fontSize: 11, color: c.sub, marginTop: 4 }}>{fmtTid(traad.sidste_aktivitet)}</div>
      {erAdmin && <div style={{ marginTop: 3 }}><Kvittering kvittering={traad.kvittering} /></div>}
    </button>
  )
}

// ---- Vagt-vaelger (kun admin, valgfri) ----
//
// Kilde: enzo_vagtplan(). Admin-grenen returnerer ALLE vagter som
// { id, status, medarbejder, dato, sted, sted_slug, er_fortid } — vi filtrerer selv
// til aabne, ikke-overstaaede. 'sted' er et faerdigt enhedsnavn fra backend
// (pent_stednavn); det vises som det er. Identiteten kommer fra JWT'en: enzo_rolle()
// laeser er_admin()/auth.uid() og ignorerer sin p_from_id-parameter helt.
//
// BEMAERK: enzo_vagtplan foelger IKKE { ok, fejl }-konventionen. Den svarer
// { rolle, vagter } eller { tilladt:false, grund } — begge tjekkes.
function VagtVaelger({ valgtVagt, onVaelg }) {
  const [vagter, setVagter] = useState(null)
  const [fejl, setFejl] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('enzo_vagtplan').then(({ data, error }) => {
      if (!alive) return
      if (error) { setFejl(error.message); return }
      if (!data) { setFejl('Kunne ikke hente vagtplanen.'); return }
      if (data.tilladt === false) { setFejl(data.grund || 'Ikke autoriseret.'); return }
      if (data.ok === false) { setFejl(data.fejl || 'Kunne ikke hente vagtplanen.'); return }
      if (!Array.isArray(data.vagter)) { setFejl('Uventet svar fra vagtplanen.'); return }
      // Kun aabne vagter der ikke er overstaaet. er_fortid kan vaere null hvis
      // bookingen mangler -> !== true, saa den kun filtrerer paa et sikkert ja.
      setVagter(data.vagter.filter((v) => v.status === 'aaben' && v.er_fortid !== true))
    })
    return () => { alive = false }
  }, [])

  if (fejl) {
    return <div style={{ ...card, padding: '10px 14px', color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{fejl}</div>
  }
  if (vagter === null) {
    return <div style={{ color: c.sub, fontSize: 14 }}>Henter åbne vagter …</div>
  }
  if (vagter.length === 0) {
    return (
      <div style={{ padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: 12, color: c.sub, fontSize: 15, background: c.card }}>
        Ingen kommende åbne vagter.
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 10, overflow: 'hidden' }}>
      {vagter.map((v, i) => {
        const sted = (v.sted || '').trim()
        return (
          <label
            key={v.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', cursor: 'pointer', fontSize: 14 }}
          >
            <input
              type="radio"
              name="vagt"
              checked={valgtVagt === v.id}
              onChange={() => onVaelg(v.id)}
              style={{ margin: 0 }}
            />
            <span>
              <span style={{ fontWeight: 500 }}>{fmtVagtTid(v.dato)}</span>
              {sted && <span style={{ color: c.sub }}> · {sted}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ---- Ny besked (kun admin) ----

function NyBesked({ onClose, onSendt }) {
  const [medarbejdere, setMedarbejdere] = useState(null)
  const [hentFejl, setHentFejl] = useState('')
  const [valgte, setValgte] = useState([])
  const [emne, setEmne] = useState('')
  const [tekst, setTekst] = useState('')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')
  const [vedhaeft, setVedhaeft] = useState(false)
  const [valgtVagt, setValgtVagt] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('medarbejdere_liste').then(({ data, error }) => {
      if (!alive) return
      if (error) { setHentFejl(error.message); return }
      if (!data || data.ok === false) { setHentFejl(data?.fejl || 'Kunne ikke hente medarbejdere.'); return }
      setMedarbejdere(data.medarbejdere || [])
    })
    return () => { alive = false }
  }, [])

  // besked_send afviser modtagere der ikke er baade active og onboarding_status='aktiv'.
  // Vi viser kun dem der faktisk kan modtage, saa William ikke rammer den fejl.
  const aktive = (medarbejdere || []).filter((m) => m.onboarding_status === 'aktiv' && m.aktiv)

  const toggle = (id) => setValgte((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))

  async function send() {
    if (busy) return
    setBusy(true); setFejl('')
    // Vedhaeftet vagt -> handlingsknap hos modtageren. Formen skal vaere praecis
    // { type, shift_id, label }; label saettes altid (backend haandhaever den ikke).
    // Ingen vagt valgt -> p_handling=null, uaendret v1-adfaerd.
    const handling = (vedhaeft && valgtVagt)
      ? { type: 'vagt_tag', shift_id: valgtVagt, label: 'Tag vagten' }
      : null
    const { data, error } = await supabase.rpc('besked_send', {
      p_staff_ids: valgte,
      p_tekst: tekst,
      p_emne: emne.trim() || null,
      p_handling: handling,
      p_booking_id: null })
    setBusy(false)
    if (error) { setFejl(error.message); return }
    if (!data || data.ok === false) { setFejl(data?.fejl || 'Beskeden kunne ikke sendes.'); return }
    onSendt(data)
  }

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50, fontFamily: font }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 560, maxWidth: '100%', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: c.ink }}>Ny besked</div>
          <button onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, padding: 0 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: c.sub, marginTop: 16, marginBottom: 8 }}>Modtagere</div>
        {hentFejl && <div style={{ ...card, padding: '10px 14px', color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{hentFejl}</div>}
        {!hentFejl && medarbejdere === null && <div style={{ color: c.sub, fontSize: 14 }}>Henter medarbejdere …</div>}
        {!hentFejl && medarbejdere !== null && aktive.length === 0 && (
          <div style={{ padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: 12, color: c.sub, fontSize: 15, background: c.card }}>
            Ingen aktive medarbejdere at sende til. Inviter dem under Medarbejdere først.
          </div>
        )}
        {aktive.length > 0 && (
          <div style={{ border: `1px solid ${c.line}`, borderRadius: 10, overflow: 'hidden' }}>
            {aktive.map((m, i) => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={valgte.includes(m.id)} onChange={() => toggle(m.id)} style={{ margin: 0 }} />
                <span style={{ fontWeight: 500 }}>{m.navn}</span>
              </label>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, color: c.sub }}>Emne (valgfrit)</label>
          <input style={{ ...input, marginTop: 4, marginBottom: 0 }} value={emne} onChange={(e) => setEmne(e.target.value)} placeholder="Emne" />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: c.sub }}>Besked</label>
          <textarea
            style={{ ...input, marginTop: 4, marginBottom: 0, minHeight: 110, resize: 'vertical' }}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="Skriv beskeden …"
          />
        </div>

        <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
          {!vedhaeft ? (
            <button onClick={() => setVedhaeft(true)} style={{ ...btnGhost, padding: '9px 14px' }}>
              + Vedhæft en åben vagt
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: c.sub }}>Vedhæft vagt</div>
                <button
                  onClick={() => { setVedhaeft(false); setValgtVagt(null) }}
                  style={{ border: 'none', background: 'transparent', color: c.slate2, fontSize: 13, cursor: 'pointer', padding: 0 }}
                >
                  Fjern
                </button>
              </div>
              <VagtVaelger valgtVagt={valgtVagt} onVaelg={setValgtVagt} />
              <div style={{ fontSize: 12.5, color: c.sub, marginTop: 8 }}>
                {valgtVagt
                  ? 'Modtageren får knappen “Tag vagten” i beskeden.'
                  : 'Vælg en vagt for at give modtageren en “Tag vagten”-knap. Uden valg sendes beskeden som ren tekst.'}
              </div>
            </>
          )}
        </div>

        {fejl && (
          <div style={{ ...card, padding: '10px 14px', marginTop: 12, background: '#FBF1EF', border: '1px solid #E0B6AF', color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{fejl}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={send} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Sender …' : 'Send'}
          </button>
          <button onClick={onClose} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>Annuller</button>
        </div>
      </div>
    </div>
  )
}

// Smal skaerm: liste ELLER traad, ikke begge. Inline styles kan ikke media queries.
function useSmalSkaerm() {
  const [smal, setSmal] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 859px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 859px)')
    const h = (e) => setSmal(e.matches)
    setSmal(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return smal
}

function BeskederUI({ erAdmin }) {
  const [traade, setTraade] = useState(null)
  const [listeFejl, setListeFejl] = useState('')
  const [listeLoading, setListeLoading] = useState(true)

  const [valgtId, setValgtId] = useState(null)
  const [traadData, setTraadData] = useState(null)
  const [traadFejl, setTraadFejl] = useState('')
  const [traadLoading, setTraadLoading] = useState(false)

  const [svarTekst, setSvarTekst] = useState('')
  const [svarBusy, setSvarBusy] = useState(false)
  const [svarFejl, setSvarFejl] = useState('')

  const [handlingBusy, setHandlingBusy] = useState(null)  // besked_id under handling
  const [handlingFejl, setHandlingFejl] = useState({})    // besked_id -> fejltekst

  const [nyAaben, setNyAaben] = useState(false)
  const [kvittering, setKvittering] = useState('')

  const smal = useSmalSkaerm()

  const loadTraade = useCallback(async () => {
    setListeLoading(true); setListeFejl('')
    const { data, error } = await supabase.rpc('besked_traade_liste')
    setListeLoading(false)
    if (error) { setListeFejl(error.message); return }
    if (!data || data.ok === false) { setListeFejl(data?.fejl || 'Kunne ikke hente beskeder.'); return }
    setTraade(data.traade || [])   // RPC'en sorterer allerede efter sidste_aktivitet desc
  }, [])

  useEffect(() => { loadTraade() }, [loadTraade])

  const loadTraad = useCallback(async (id) => {
    setTraadLoading(true); setTraadFejl('')
    const { data, error } = await supabase.rpc('besked_traad_hent', { p_traad_id: id })
    setTraadLoading(false)
    if (error) { setTraadFejl(error.message); return null }
    if (!data || data.ok === false) { setTraadFejl(data?.fejl || 'Kunne ikke hente samtalen.'); return null }
    setTraadData(data)
    return data
  }, [])

  // Kun medarbejdere har besked_status-raekker (William er ikke deltager og har
  // altid ulaeste=0). RPC'en er idempotent og returnerer { ok:found } uden fejltekst,
  // saa den bruges som stille housekeeping — ikke som en brugerhandling.
  const markerLaest = useCallback(async (beskeder) => {
    const mine = (beskeder || []).filter((b) => !b.fra_mig)
    if (mine.length === 0) return
    await Promise.all(mine.map((b) => supabase.rpc('besked_marker_laest', { p_besked_id: b.id })))
    loadTraade()
  }, [loadTraade])

  const aabnTraad = useCallback(async (t) => {
    setValgtId(t.id)
    setTraadData(null); setTraadFejl(''); setSvarTekst(''); setSvarFejl(''); setHandlingFejl({}); setKvittering('')
    const d = await loadTraad(t.id)
    if (d && !erAdmin && (t.ulaeste || 0) > 0) markerLaest(d.beskeder)
  }, [loadTraad, markerLaest, erAdmin])

  async function sendSvar() {
    const t = svarTekst.trim()
    if (!t || svarBusy || !valgtId) return
    setSvarBusy(true); setSvarFejl('')
    const { data, error } = await supabase.rpc('besked_svar', { p_traad_id: valgtId, p_tekst: t })
    setSvarBusy(false)
    if (error) { setSvarFejl(error.message); return }
    if (!data || data.ok === false) { setSvarFejl(data?.fejl || 'Svaret kunne ikke sendes.'); return }
    setSvarTekst('')
    await loadTraad(valgtId)
    loadTraade()
  }

  async function udfoerHandling(besked) {
    if (handlingBusy) return
    setHandlingBusy(besked.id)
    setHandlingFejl((f) => ({ ...f, [besked.id]: '' }))
    const { data, error } = await supabase.rpc('besked_handling_udfoer', { p_besked_id: besked.id })
    setHandlingBusy(null)
    if (error) { setHandlingFejl((f) => ({ ...f, [besked.id]: error.message })); return }
    if (!data || data.ok === false) {
      setHandlingFejl((f) => ({ ...f, [besked.id]: data?.fejl || 'Handlingen kunne ikke udføres.' }))
      return
    }
    // Backend indsaetter et status-svar ("tog vagten.") i traaden -> genindlaes saa det vises.
    await loadTraad(valgtId)
    loadTraade()
  }

  function nyBeskedSendt(res) {
    setNyAaben(false)
    const navne = Array.isArray(res.modtagere) ? res.modtagere.join(', ') : ''
    setKvittering(`Sendt til ${res.antal_modtagere} ${res.antal_modtagere === 1 ? 'medarbejder' : 'medarbejdere'}${navne ? ` (${navne})` : ''}.`)
    loadTraade()
    if (res.traad_id) {
      setValgtId(res.traad_id)
      setTraadData(null); setTraadFejl(''); setSvarTekst(''); setSvarFejl(''); setHandlingFejl({})
      loadTraad(res.traad_id)
    }
  }

  const valgtTraad = (traade || []).find((t) => t.id === valgtId) || null
  const visListe = !smal || !valgtId
  const visTraad = !smal || !!valgtId

  const listePanel = (
    <div style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: smal ? undefined : '72vh' }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.line}`, fontSize: 12, color: c.sub }}>
        Samtaler
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {listeLoading && <div style={{ padding: '14px', color: c.sub, fontSize: 14 }}>Henter samtaler …</div>}
        {listeFejl && <div style={{ padding: '14px', color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{listeFejl}</div>}
        {!listeLoading && !listeFejl && traade && traade.length === 0 && (
          <div style={{ padding: '14px', color: c.sub, fontSize: 14 }}>
            {erAdmin ? 'Ingen samtaler endnu. Klik “Ny besked” for at skrive til dine medarbejdere.' : 'Du har ingen beskeder endnu.'}
          </div>
        )}
        {!listeFejl && (traade || []).map((t) => (
          <TraadLinje key={t.id} traad={t} valgt={t.id === valgtId} erAdmin={erAdmin} onClick={() => aabnTraad(t)} />
        ))}
      </div>
    </div>
  )

  const traadPanel = (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', maxHeight: smal ? undefined : '72vh', minHeight: 320 }}>
      {smal && valgtId && (
        <button onClick={() => { setValgtId(null); setTraadData(null) }} style={{ ...btnGhost, alignSelf: 'flex-start', padding: '7px 12px', marginBottom: 12 }}>
          ← Tilbage
        </button>
      )}

      {!valgtId && (
        <div style={{ color: c.sub, fontSize: 14, margin: 'auto' }}>Vælg en samtale til venstre.</div>
      )}

      {valgtId && (
        <>
          <div style={{ borderBottom: `1px solid ${c.line}`, paddingBottom: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>
              {traadData?.traad?.emne || valgtTraad?.emne || 'Samtale'}
            </div>
            {valgtTraad && Array.isArray(valgtTraad.deltagere) && valgtTraad.deltagere.length > 0 && (
              <div style={{ fontSize: 12.5, color: c.sub, marginTop: 3 }}>{valgtTraad.deltagere.join(', ')}</div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 2 }}>
            {traadLoading && <div style={{ color: c.sub, fontSize: 14 }}>Henter samtalen …</div>}
            {traadFejl && <div style={{ color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{traadFejl}</div>}
            {!traadLoading && !traadFejl && traadData && (traadData.beskeder || []).length === 0 && (
              <div style={{ color: c.sub, fontSize: 14 }}>Ingen beskeder i samtalen.</div>
            )}
            {!traadFejl && (traadData?.beskeder || []).map((b) => (
              <BeskedBoble
                key={b.id}
                besked={b}
                erAdmin={erAdmin}
                busy={handlingBusy === b.id}
                fejl={handlingFejl[b.id]}
                onUdfoer={udfoerHandling}
              />
            ))}
          </div>

          {!traadFejl && (
            <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 12, marginTop: 12 }}>
              <textarea
                style={{ ...input, marginBottom: 0, minHeight: 70, resize: 'vertical' }}
                value={svarTekst}
                onChange={(e) => setSvarTekst(e.target.value)}
                placeholder="Skriv et svar …"
              />
              {svarFejl && <div style={{ fontSize: 13, color: c.red, marginTop: 8, whiteSpace: 'pre-wrap' }}>{svarFejl}</div>}
              <div style={{ marginTop: 10 }}>
                <button onClick={sendSvar} disabled={svarBusy || !svarTekst.trim()} style={{ ...btn, opacity: (svarBusy || !svarTekst.trim()) ? 0.5 : 1, cursor: (svarBusy || !svarTekst.trim()) ? 'default' : 'pointer' }}>
                  {svarBusy ? 'Sender …' : 'Send svar'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Beskeder</h1>
        {erAdmin && <button onClick={() => { setNyAaben(true); setKvittering('') }} style={btn}>Ny besked</button>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>
        {erAdmin
          ? 'Skriv til dine medarbejdere og følg med i hvem der har læst og handlet.'
          : 'Dine beskeder fra Casa Food. Svar direkte, og udfør handlinger i beskeden.'}
      </p>

      {kvittering && (
        <div style={{ ...card, marginTop: 12, padding: '10px 14px', background: '#F1F6F1', border: '1px solid #BFD3C1', color: c.green, fontSize: 14 }}>
          {kvittering}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: smal ? '1fr' : '320px 1fr', gap: sp(4), marginTop: 16, alignItems: 'start' }}>
        {visListe && listePanel}
        {visTraad && traadPanel}
      </div>

      {nyAaben && <NyBesked onClose={() => setNyAaben(false)} onSendt={nyBeskedSendt} />}
    </div>
  )
}

// ---------------- Rolle-detektion (samme moenster som Kalender.jsx) ----------------

export default function Beskeder() {
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
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Beskeder</h1>
        <div style={{ ...card, marginTop: 16, color: c.red }}>Fejl: {rolleFejl}</div>
      </div>
    )
  }
  if (rolle === undefined) {
    return (
      <div>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Beskeder</h1>
        <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter beskeder …</div>
      </div>
    )
  }
  return <BeskederUI erAdmin={rolle === 'admin'} />
}
