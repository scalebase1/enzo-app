import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { useGenindlaes } from '../hooks.js'
import { c, card, input, sp, tone } from '../ui.js'
import { Kort, StatusChip, Pilleknap, Segmentvaelger, Dialog, TomTilstand } from '../komponenter/index.jsx'
import { MaanedsGrid, byggeEnhedFarver, UDEN_ENHED_FARVE } from './Kalender.jsx'

const UGEDAGE = [
  { nr: 1, kort: 'Man' }, { nr: 2, kort: 'Tir' }, { nr: 3, kort: 'Ons' },
  { nr: 4, kort: 'Tor' }, { nr: 5, kort: 'Fre' }, { nr: 6, kort: 'Lør' }, { nr: 7, kort: 'Søn' },
]

const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const timerFmt = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 })} t`

// check_in/check_out er timestamptz. Vi bygger tidspunktet i browserens lokale
// tid og sender det som UTC, saa det er utvetydigt uanset serverens zone.
const tidsstempel = (dato, hhmm) => {
  const d = new Date(`${dato}T${hhmm}:00`)
  return isNaN(d) ? null : d.toISOString()
}

// 'dato' kommer som YYYY-MM-DD. Parses lokalt, saa dagen ikke skrider en
// tidszone tilbage.
const tilDato = (s) => (s ? new Date(`${s}T00:00:00`) : null)
const isoDato = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDag = (s) => {
  const d = tilDato(s)
  return d ? d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'
}
const fmtKort = (s) => {
  const d = tilDato(s)
  return d ? d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) : '—'
}

// ISO-ugenummer (mandag som ugens foerste dag).
function ugeNr(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dag)
  const aarsstart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - aarsstart) / 86400000 + 1) / 7)
}

// Backendens tekst vises ORDRET — men kun hvis den faktisk er en tekst.
function menneskeligFejl(kandidat, reserve) {
  if (typeof kandidat === 'string' && kandidat.trim()) return kandidat.trim()
  return reserve
}
function tjek(data, error, reserve) {
  if (error) return menneskeligFejl(error.message, reserve)
  if (!data || data.ok === false) return menneskeligFejl(data?.fejl, reserve)
  return null
}

const STATUS_TONE = { planlagt: tone.aktiv, afholdt: tone.ok, aflyst: tone.fejl }

function perioder() {
  const nu = new Date()
  const y = nu.getFullYear(), m = nu.getMonth()
  const idag = new Date(y, m, nu.getDate())
  return {
    kommende: { label: 'Kommende 60 dage', fra: idag, til: new Date(y, m, nu.getDate() + 60) },
    denne: { label: 'Denne måned', fra: new Date(y, m, 1), til: new Date(y, m + 1, 0) },
    naeste: { label: 'Næste måned', fra: new Date(y, m + 1, 1), til: new Date(y, m + 2, 0) },
  }
}

function Fejlboks({ tekst }) {
  if (!tekst) return null
  return (
    <div style={{ background: tone.fejl.bg, color: tone.fejl.col, borderRadius: 10, padding: '10px 12px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
      {tekst}
    </div>
  )
}

function Felt({ label, hjaelp, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label style={{ fontSize: 13, color: c.sub }}>{label}</label>
      <input style={{ ...input, marginBottom: 0 }} {...rest} />
      {hjaelp && <div style={{ fontSize: 12.5, color: c.sub }}>{hjaelp}</div>}
    </div>
  )
}

// ---------------- Driftsdag ----------------

function Driftsdag({ d, aktive, busy, fejl, onBeman, onAfmeld, onStatus, onSlet, onTimer }) {
  const [valgtStaff, setValgtStaff] = useState('')
  const [bekraeftSlet, setBekraeftSlet] = useState(false)

  const aflyst = d.status === 'aflyst'
  const ubemandet = Number(d.antal_bemandet || 0) === 0 && !aflyst
  const manglerTimer = Number(d.timer_mangler || 0) > 0 && !aflyst
  const bemanding = Array.isArray(d.bemanding) ? d.bemanding : []
  const rowBusy = busy === d.id
  // Timer kan foerst registreres naar dagen er overstaaet (backend afviser
  // fremtidige vagter) — vis derfor kun handlingen paa dage der er passeret.
  const passeret = (tilDato(d.dato) || new Date()) <= new Date(new Date().toDateString())

  return (
    <Kort style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      opacity: aflyst ? 0.6 : 1,
      // De to ting William skal reagere paa: ingen paa vagt, eller folk der
      // har arbejdet uden at faa timer registreret (= uden loen).
      borderLeft: ubemandet ? `3px solid ${tone.fejl.col}`
        : manglerTimer ? `3px solid ${tone.advarsel.col}` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.ink, textTransform: 'capitalize' }}>{fmtDag(d.dato)}</div>
          <div style={{ fontSize: 13.5, color: c.sub, marginTop: 2 }}>
            {d.vogn} · {d.aabner}–{d.lukker}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip status={d.status} tekst={d.status_tekst} farve={STATUS_TONE[d.status]} />
          {Number(d.loen_i_alt || 0) > 0 && (
            <StatusChip tekst={`${timerFmt(d.timer_i_alt)} · ${kr(d.loen_i_alt)}`} farve={tone.neutral} />
          )}
        </div>
      </div>

      {d.note && <div style={{ fontSize: 13.5, color: c.sub, whiteSpace: 'pre-wrap' }}>{d.note}</div>}

      {ubemandet && (
        <div style={{ background: tone.fejl.bg, color: tone.fejl.col, borderRadius: 10, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}>
          Ingen på vagt — vognen åbner ubemandet
        </div>
      )}
      {manglerTimer && (
        <div style={{ background: tone.advarsel.bg, color: tone.advarsel.col, borderRadius: 10, padding: '8px 12px', fontSize: 14 }}>
          {d.timer_mangler} {Number(d.timer_mangler) === 1 ? 'person mangler' : 'personer mangler'} registrerede timer — de får ikke løn for dagen
        </div>
      )}

      {bemanding.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bemanding.map((b) => {
            const harTimer = b.timer != null
            return (
              <div key={b.vagt_id || b.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: c.ink }}>{b.navn}</span>
                {harTimer ? (
                  <span style={{ color: c.sub }}>{timerFmt(b.timer)}{b.loen != null ? ` · ${kr(b.loen)}` : ''}</span>
                ) : (
                  <span style={{ color: tone.advarsel.col }}>ingen timer</span>
                )}
                {!aflyst && passeret && !harTimer && (
                  <Pilleknap variant="omrids" lille disabled={!!busy} onClick={() => onTimer(d, b)}>Registrér timer</Pilleknap>
                )}
                <button
                  onClick={() => onAfmeld(d, b.staff_id, b.navn)}
                  disabled={!!busy}
                  aria-label={`Afmeld ${b.navn}`}
                  title={`Afmeld ${b.navn}`}
                  style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: c.sub, cursor: busy ? 'default' : 'pointer', fontSize: 17, lineHeight: 1, padding: '0 2px' }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!aflyst && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={valgtStaff}
            onChange={(e) => setValgtStaff(e.target.value)}
            disabled={!!busy}
            style={{ ...input, marginBottom: 0, padding: '9px 10px', flex: '1 1 160px', minWidth: 0 }}
          >
            <option value="">Sæt på vagt …</option>
            {aktive.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
          </select>
          <Pilleknap lille disabled={!!busy || !valgtStaff} onClick={() => { onBeman(d, valgtStaff); setValgtStaff('') }}>
            {rowBusy ? '…' : 'Bemand'}
          </Pilleknap>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!aflyst && <Pilleknap variant="omrids" lille disabled={!!busy} onClick={() => onStatus(d, 'aflyst')}>Aflys</Pilleknap>}
        {aflyst && <Pilleknap variant="omrids" lille disabled={!!busy} onClick={() => onStatus(d, 'planlagt')}>Genåbn</Pilleknap>}
        {!aflyst && passeret && d.status !== 'afholdt' && (
          <Pilleknap variant="omrids" lille disabled={!!busy} onClick={() => onStatus(d, 'afholdt')}>Markér afholdt</Pilleknap>
        )}
        {bekraeftSlet ? (
          <>
            <span style={{ fontSize: 13, color: tone.fejl.col, alignSelf: 'center' }}>Slet dagen?</span>
            <Pilleknap lille fare disabled={!!busy} onClick={() => onSlet(d)}>{rowBusy ? 'Sletter …' : 'Ja, slet'}</Pilleknap>
            <Pilleknap variant="omrids" lille onClick={() => setBekraeftSlet(false)}>Fortryd</Pilleknap>
          </>
        ) : (
          <Pilleknap variant="omrids" lille fare disabled={!!busy} onClick={() => setBekraeftSlet(true)}>Slet</Pilleknap>
        )}
      </div>

      <Fejlboks tekst={fejl} />
    </Kort>
  )
}

// ---------------- Dialoger ----------------

function SerieDialog({ vogne, onClose, onFaerdig }) {
  const p = perioder()
  const [enhed, setEnhed] = useState(vogne[0]?.id || '')
  const [fra, setFra] = useState(isoDato(p.denne.fra))
  const [til, setTil] = useState(isoDato(p.denne.til))
  const [dage, setDage] = useState([4, 5, 6, 7])   // tors-søn: det typiske sommermønster
  const [aabner, setAabner] = useState('12:00')
  const [lukker, setLukker] = useState('21:00')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  const skift = (nr) => setDage((d) => (d.includes(nr) ? d.filter((x) => x !== nr) : [...d, nr].sort((a, b) => a - b)))

  async function opret() {
    setBusy(true); setFejl('')
    const { data, error } = await supabase.rpc('drift_serie', {
      p_enhed_id: enhed,
      p_fra: fra,
      p_til: til,
      p_ugedage: dage,
      p_aabner: aabner,
      p_lukker: lukker,
      p_note: note.trim() || null,
    })
    setBusy(false)
    const f = tjek(data, error, 'Serien kunne ikke oprettes.')
    if (f) { setFejl(f); return }
    // Backendens besked fortaeller hvor mange der blev oprettet og sprunget over.
    onFaerdig(menneskeligFejl(data.besked, `${data.oprettet} driftsdage oprettet.`))
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={520} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 6 }}>Opret serie</div>
      <div style={{ fontSize: 14, color: c.sub, marginBottom: 14 }}>
        Fx “The Blue Pearl åben torsdag–søndag hele juli”. Dage der allerede findes, springes over.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 6 }}>Vogn</div>
          <Segmentvaelger
            muligheder={vogne.map((v) => ({ key: v.id, label: v.navn }))}
            valgt={enhed}
            onVaelg={setEnhed}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}><Felt label="Fra" type="date" value={fra} onChange={(e) => setFra(e.target.value)} /></div>
          <div style={{ flex: '1 1 140px' }}><Felt label="Til" type="date" value={til} onChange={(e) => setTil(e.target.value)} /></div>
        </div>

        <div>
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 6 }}>Ugedage</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {UGEDAGE.map((u) => {
              const valgt = dage.includes(u.nr)
              return (
                <button
                  key={u.nr}
                  onClick={() => skift(u.nr)}
                  style={{
                    minHeight: 44, minWidth: 52, borderRadius: 999, cursor: 'pointer', fontSize: 14,
                    fontWeight: valgt ? 500 : 400,
                    border: `1px solid ${valgt ? c.accent : c.line}`,
                    background: valgt ? c.accent : c.card,
                    color: valgt ? '#fff' : c.sub,
                  }}
                >
                  {u.kort}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}><Felt label="Åbner" type="time" value={aabner} onChange={(e) => setAabner(e.target.value)} /></div>
          <div style={{ flex: '1 1 140px' }}><Felt label="Lukker" type="time" value={lukker} onChange={(e) => setLukker(e.target.value)} /></div>
        </div>

        <Felt label="Note (valgfri)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fx hentes på lageret kl. 10" />

        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={opret} disabled={busy || !enhed || dage.length === 0}>
            {busy ? 'Opretter …' : 'Opret serie'}
          </Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

function DagDialog({ vogne, onClose, onFaerdig }) {
  const [enhed, setEnhed] = useState(vogne[0]?.id || '')
  const [dato, setDato] = useState(isoDato(new Date()))
  const [aabner, setAabner] = useState('12:00')
  const [lukker, setLukker] = useState('21:00')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function opret() {
    setBusy(true); setFejl('')
    const { data, error } = await supabase.rpc('drift_opret', {
      p_enhed_id: enhed, p_dato: dato, p_aabner: aabner, p_lukker: lukker,
      p_note: note.trim() || null,
    })
    setBusy(false)
    // Fx "The Blue Pearl har allerede en driftsdag d. 06-08-2026." vises ordret.
    const f = tjek(data, error, 'Driftsdagen kunne ikke oprettes.')
    if (f) { setFejl(f); return }
    onFaerdig(`${data.vogn}: driftsdag oprettet.`)
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={470} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 14 }}>Opret enkelt dag</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 6 }}>Vogn</div>
          <Segmentvaelger muligheder={vogne.map((v) => ({ key: v.id, label: v.navn }))} valgt={enhed} onVaelg={setEnhed} />
        </div>
        <Felt label="Dato" type="date" value={dato} onChange={(e) => setDato(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}><Felt label="Åbner" type="time" value={aabner} onChange={(e) => setAabner(e.target.value)} /></div>
          <div style={{ flex: '1 1 140px' }}><Felt label="Lukker" type="time" value={lukker} onChange={(e) => setLukker(e.target.value)} /></div>
        </div>
        <Felt label="Note (valgfri)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={opret} disabled={busy || !enhed}>{busy ? 'Opretter …' : 'Opret'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

function TimerDialog({ d, person, onClose, onFaerdig }) {
  const [moede, setMoede] = useState(d.aabner || '12:00')
  const [slut, setSlut] = useState(d.lukker || '21:00')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function gem() {
    const ind = tidsstempel(d.dato, moede)
    const ud = tidsstempel(d.dato, slut)
    if (!ind || !ud) { setFejl('Angiv både mødetid og sluttid.'); return }
    setBusy(true); setFejl('')
    // Vogndrift: booking_id er null, driftsdag_id peger paa dagen.
    const { data, error } = await supabase.rpc('registrer_timer', {
      p_staff_id: person.staff_id,
      p_booking_id: null,
      p_check_in: ind,
      p_check_out: ud,
      p_driftsdag_id: d.id,
    })
    setBusy(false)
    const f = tjek(data, error, 'Timerne kunne ikke registreres.')
    if (f) { setFejl(f); return }
    onFaerdig(`${data.medarbejder}: ${timerFmt(data.timer)} · ${kr(data.loen)} registreret.`)
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={440} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 6 }}>
        Registrér timer — {person.navn}
      </div>
      <div style={{ fontSize: 14, color: c.sub, marginBottom: 14, textTransform: 'capitalize' }}>
        {fmtDag(d.dato)} · {d.vogn}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}><Felt label="Mødte" type="time" value={moede} onChange={(e) => setMoede(e.target.value)} /></div>
          <div style={{ flex: '1 1 140px' }}><Felt label="Sluttede" type="time" value={slut} onChange={(e) => setSlut(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12.5, color: c.sub }}>Løn beregnes ud fra medarbejderens timeløn.</div>
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={gem} disabled={busy}>{busy ? 'Gemmer …' : 'Registrér'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------- Sektionen ----------------

export default function Vogndrift() {
  const P = useMemo(() => perioder(), [])
  const [vogne, setVogne] = useState([])
  const [aktive, setAktive] = useState([])
  const [dage, setDage] = useState(null)
  const [hentFejl, setHentFejl] = useState('')
  const [loading, setLoading] = useState(true)

  const [vognFilter, setVognFilter] = useState('alle')
  const [periode, setPeriode] = useState('kommende')

  const [busy, setBusy] = useState(null)
  const [radFejl, setRadFejl] = useState({})      // driftsdag-id -> backendens tekst
  const [kvittering, setKvittering] = useState('')
  const [serieAaben, setSerieAaben] = useState(false)
  const [dagAaben, setDagAaben] = useState(false)
  const [timerFor, setTimerFor] = useState(null)   // { d, person }

  const [visning, setVisning] = useState('kalender') // 'kalender' | 'liste'
  const [farver, setFarver] = useState(() => new Map())
  const [kalDage, setKalDage] = useState(null)       // drift_kalender-dage
  const [kalFejl, setKalFejl] = useState('')
  const [kalCursor, setKalCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [valgtDag, setValgtDag] = useState(null)     // drift_kalender-dag i detalje-dialogen

  // Kun de FYSISKE vogne. Casa Food Catering ejer events og hoerer til i
  // Kalenderen — den skal slet ikke kunne vaelges her.
  useEffect(() => {
    let alive = true
    supabase.rpc('enheder_liste').then(({ data, error }) => {
      if (!alive || error || !Array.isArray(data)) return
      setVogne(data.filter((e) => e.type === 'madvogn'))
      setFarver(byggeEnhedFarver(data))   // samme farvetildeling som Kalender/Forside
    })
    supabase.rpc('medarbejdere_liste').then(({ data }) => {
      if (!alive || !data || data.ok === false) return
      setAktive((data.medarbejdere || []).filter((m) => m.onboarding_status === 'aktiv' && m.aktiv))
    })
    return () => { alive = false }
  }, [])

  const load = useCallback(async ({ foerste = false } = {}) => {
    if (foerste) setLoading(true)
    setHentFejl('')
    const p = P[periode]
    const args = { p_fra: isoDato(p.fra), p_til: isoDato(p.til) }
    if (vognFilter !== 'alle') args.p_enhed_id = vognFilter
    const { data, error } = await supabase.rpc('drift_liste', args)
    setLoading(false)
    const f = tjek(data, error, 'Kunne ikke hente driftsdagene.')
    if (f) { setHentFejl(f); return }
    setDage(data.dage || [])
  }, [P, periode, vognFilter])

  // Kalenderen henter et bredt vindue (uden enhed-filter i kontrakten) og
  // navigeres pr. maaned lokalt; vogn-filteret anvendes klientside.
  const loadKalender = useCallback(async () => {
    setKalFejl('')
    const { data, error } = await supabase.rpc('drift_kalender', {})
    const f = tjek(data, error, 'Kunne ikke hente vognkalenderen.')
    if (f) { setKalFejl(f); return }
    setKalDage(data.dage || [])
    // Hold en aaben detalje i sync med friske data (som bookingdetaljen).
    setValgtDag((prev) => (prev ? (data.dage || []).find((x) => x.driftsdag_id === prev.driftsdag_id) || null : prev))
  }, [])

  useEffect(() => { load({ foerste: true }) }, [load])
  // Uden foerste:true — genindlaesning maa ikke skjule listen mens den henter.
  useGenindlaes(useCallback(() => { load(); loadKalender() }, [load, loadKalender]))
  useEffect(() => { loadKalender() }, [loadKalender])

  function fejlPaa(id, tekst) { setRadFejl((f) => ({ ...f, [id]: tekst })) }
  function rydFejl(id) { setRadFejl((f) => ({ ...f, [id]: '' })) }

  async function kald(d, navn, args, reserve, kvit) {
    if (busy) return
    setBusy(d.id); rydFejl(d.id); setKvittering('')
    const { data, error } = await supabase.rpc(navn, args)
    setBusy(null)
    const f = tjek(data, error, reserve)
    if (f) { fejlPaa(d.id, f); return }
    if (kvit) setKvittering(kvit(data))
    load()
    loadKalender()
  }

  const onBeman = (d, staffId) =>
    kald(d, 'drift_beman', { p_driftsdag_id: d.id, p_staff_id: staffId },
      'Kunne ikke sætte på vagt.',
      (r) => `${r.medarbejder} er sat på ${r.vogn}.`)

  const onAfmeld = (d, staffId, navn) =>
    kald(d, 'drift_afmeld', { p_driftsdag_id: d.id, p_staff_id: staffId },
      'Kunne ikke afmelde.', () => `${navn} er afmeldt.`)


  const onStatus = (d, status) =>
    kald(d, 'drift_saet_status', { p_driftsdag_id: d.id, p_status: status },
      'Kunne ikke ændre status.',
      (r) => `${r.vogn}: ${r.status}.`)

  const onTimer = (d, person) => { setKvittering(''); setTimerFor({ d, person }) }

  const onSlet = (d) =>
    kald(d, 'drift_slet', { p_driftsdag_id: d.id },
      'Kunne ikke slette driftsdagen.',
      (r) => menneskeligFejl(r.besked, 'Driftsdagen er slettet.'))

  // Loenomkostning pr. vogn i den viste periode — regnet paa de hentede dage.
  const loenPrVogn = useMemo(() => {
    const m = new Map()
    for (const d of dage || []) {
      const l = Number(d.loen_i_alt || 0)
      if (!l) continue
      m.set(d.vogn, (m.get(d.vogn) || 0) + l)
    }
    return [...m.entries()]
  }, [dage])

  // Dage hvor nogen har staaet paa vagt uden at faa timer registreret.
  const manglerTimer = (dage || []).filter((d) => Number(d.timer_mangler || 0) > 0 && d.status !== 'aflyst').length

  const ubemandede = (dage || []).filter((d) => Number(d.antal_bemandet || 0) === 0 && d.status !== 'aflyst').length

  // Grupperet pr. uge: passer til vognenes ugerytme (fx tors-soen) og holder
  // grupperne smaa nok til at kunne overskues paa en telefon.
  const uger = useMemo(() => {
    const grupper = new Map()
    for (const d of dage || []) {
      const dt = tilDato(d.dato)
      if (!dt) continue
      const n = ugeNr(dt)
      const noegle = `${dt.getFullYear()}-${n}`
      if (!grupper.has(noegle)) grupper.set(noegle, { nr: n, dage: [] })
      grupper.get(noegle).dage.push(d)
    }
    return [...grupper.values()]
  }, [dage])

  // Kalender-events til den genbrugte maanedskomponent. To signaler pr. dag,
  // begge altid til stede: venstrekantens FARVE = hvilken vogn (identitet,
  // via byggeEnhedFarver som resten af appen), og BAGGRUNDEN = status —
  // ROED naar vognen aabner ubemandet, GUL naar folk mangler timeregistrering.
  const kalEvents = useMemo(() => (kalDage || [])
    .filter((d) => vognFilter === 'alle' || d.enhed_id === vognFilter)
    .map((d) => {
      const vf = farver.get(d.enhed) || UDEN_ENHED_FARVE
      let bg = vf.background, col = vf.color
      if (d.ubemandet) { bg = tone.fejl.bg; col = tone.fejl.col }
      else if (Number(d.timer_mangler || 0) > 0) { bg = tone.advarsel.bg; col = tone.advarsel.col }
      return {
        key: d.driftsdag_id,
        start: tilDato(d.dato),
        chip: {
          label: d.titel || `${d.vogn} ${d.aabner}–${d.lukker}`,
          tone: { background: bg, color: col, border: vf.border },
          struck: !!d.aflyst,
        },
        raw: d,
      }
    }), [kalDage, vognFilter, farver])

  // drift_kalender-dagen -> den form Driftsdag-kortet forventer (drift_liste).
  // bemanding mangler vagt_id og loen pr. person i kalenderen — kortet er
  // gjort robust mod begge dele.
  const normDag = (dk) => ({
    id: dk.driftsdag_id, vogn: dk.vogn, dato: dk.dato,
    aabner: dk.aabner, lukker: dk.lukker,
    status: dk.status, status_tekst: dk.status_tekst, note: dk.note,
    bemanding: (dk.bemanding || []).map((b) => ({ staff_id: b.staff_id, navn: b.navn, timer: b.timer })),
    antal_bemandet: dk.antal_bemandet, timer_i_alt: dk.timer_i_alt,
    loen_i_alt: dk.loen_i_alt, timer_mangler: dk.timer_mangler,
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 500 }}>Vogndrift</h1>
          <p style={{ color: c.sub, marginTop: 0, fontSize: 15 }}>
            De to madvognes faste drift i Sommerland Sjælland. Arrangementer ligger i Kalenderen.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pilleknap onClick={() => setSerieAaben(true)} disabled={vogne.length === 0}>Opret serie</Pilleknap>
          <Pilleknap variant="omrids" onClick={() => setDagAaben(true)} disabled={vogne.length === 0}>Opret dag</Pilleknap>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Segmentvaelger
          muligheder={[{ key: 'kalender', label: 'Kalender' }, { key: 'liste', label: 'Liste' }]}
          valgt={visning}
          onVaelg={setVisning}
        />
        <Segmentvaelger
          muligheder={[{ key: 'alle', label: 'Alle vogne' }, ...vogne.map((v) => ({ key: v.id, label: v.navn }))]}
          valgt={vognFilter}
          onVaelg={setVognFilter}
        />
        {visning === 'liste' && (
          <Segmentvaelger
            muligheder={Object.entries(P).map(([k, v]) => ({ key: k, label: v.label }))}
            valgt={periode}
            onVaelg={setPeriode}
          />
        )}
      </div>

      {kvittering && (
        <div style={{ ...card, marginTop: 16, padding: '10px 14px', background: tone.ok.bg, border: `1px solid ${tone.ok.col}33`, color: tone.ok.col, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ whiteSpace: 'pre-wrap' }}>{kvittering}</span>
          <button onClick={() => setKvittering('')} aria-label="Luk" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {visning === 'kalender' ? (
        <div style={{ marginTop: 16 }}>
          {kalFejl && <div style={{ ...card, color: c.red, whiteSpace: 'pre-wrap' }}>{kalFejl}</div>}
          {!kalFejl && kalDage === null && <div style={{ ...card, color: c.sub }}>Henter vognkalenderen …</div>}
          {!kalFejl && kalDage && (
            <>
              <MaanedsGrid
                cursor={kalCursor}
                onCursor={setKalCursor}
                events={kalEvents}
                onSelect={(raw) => { setKvittering(''); setValgtDag(raw) }}
              />
              {/* Signaturforklaring, saa de to markeringer kan aflaeses paa et blik. */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 12.5, color: c.sub }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: tone.fejl.bg, border: `1px solid ${tone.fejl.col}` }} /> Åbner ubemandet
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: tone.advarsel.bg, border: `1px solid ${tone.advarsel.col}` }} /> Mangler timeregistrering
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, borderLeft: `3px solid ${c.slate2}` }} /> Kantfarve = vogn
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
      {/* Noegletal: loenomkostning pr. vogn, plus de to ting William skal
          reagere paa — ubemandede dage og manglende timeregistrering. */}
      {(loenPrVogn.length > 0 || ubemandede > 0 || manglerTimer > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: sp(3), marginTop: 16 }}>
          {loenPrVogn.map(([vogn, sum]) => (
            <Kort key={vogn} padding="14px 16px">
              <div style={{ fontSize: 13, color: c.sub }}>Lønomkostning · {vogn}</div>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: c.ink }}>{kr(sum)}</div>
            </Kort>
          ))}
          {ubemandede > 0 && (
            <Kort padding="14px 16px">
              <div style={{ fontSize: 13, color: c.sub }}>Ubemandede dage</div>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: tone.fejl.col }}>{ubemandede}</div>
            </Kort>
          )}
          {manglerTimer > 0 && (
            <Kort padding="14px 16px">
              <div style={{ fontSize: 13, color: c.sub }}>Dage uden timeregistrering</div>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: tone.advarsel.col }}>{manglerTimer}</div>
            </Kort>
          )}
        </div>
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter driftsdage …</div>}
      {hentFejl && <div style={{ ...card, marginTop: 16, color: c.red, whiteSpace: 'pre-wrap' }}>{hentFejl}</div>}

      {!loading && !hentFejl && dage && (
        dage.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <TomTilstand tekst="Ingen driftsdage i perioden. Brug “Opret serie” til at planlægge en hel sæson på én gang." />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: sp(6), marginTop: 16 }}>
            {uger.map((u) => (
              <div key={u.nr}>
                <div style={{ fontSize: 13, fontWeight: 500, color: c.sub, marginBottom: 10 }}>
                  Uge {u.nr} · {fmtKort(u.dage[0].dato)}–{fmtKort(u.dage[u.dage.length - 1].dato)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: sp(4) }}>
                  {u.dage.map((d) => (
                    <Driftsdag
                      key={d.id}
                      d={d}
                      aktive={aktive}
                      busy={busy}
                      fejl={radFejl[d.id]}
                      onBeman={onBeman}
                      onAfmeld={onAfmeld}
                      onStatus={onStatus}
                      onTimer={onTimer}
                      onSlet={onSlet}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

        </>
      )}

      {serieAaben && (
        <SerieDialog
          vogne={vogne}
          onClose={() => setSerieAaben(false)}
          onFaerdig={(t) => { setSerieAaben(false); setKvittering(t); load(); loadKalender() }}
        />
      )}
      {timerFor && (
        <TimerDialog
          d={timerFor.d}
          person={timerFor.person}
          onClose={() => setTimerFor(null)}
          onFaerdig={(t) => { setTimerFor(null); setKvittering(t); load(); loadKalender() }}
        />
      )}
      {dagAaben && (
        <DagDialog
          vogne={vogne}
          onClose={() => setDagAaben(false)}
          onFaerdig={(t) => { setDagAaben(false); setKvittering(t); load(); loadKalender() }}
        />
      )}

      {/* Klik paa en dag i kalenderen -> samme kort som i listen, i en dialog.
          Genbruger de UI-testede handlinger (bemand/afmeld/timer/aflys/slet). */}
      {valgtDag && (
        <Dialog onClose={() => setValgtDag(null)} bredde={520}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={() => setValgtDag(null)} aria-label="Luk" style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: 'pointer', padding: 0 }}>×</button>
          </div>
          <Driftsdag
            d={normDag(valgtDag)}
            aktive={aktive}
            busy={busy}
            fejl={radFejl[valgtDag.driftsdag_id]}
            onBeman={onBeman}
            onAfmeld={onAfmeld}
            onStatus={onStatus}
            onTimer={onTimer}
            onSlet={onSlet}
          />
        </Dialog>
      )}
    </div>
  )
}
