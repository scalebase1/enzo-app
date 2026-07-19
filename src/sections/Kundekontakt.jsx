import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { c, card, input, sp, tone } from '../ui.js'
import { Kort, StatusChip, Pilleknap, Segmentvaelger, Dialog, TomTilstand } from '../komponenter/index.jsx'
import { KladdeKort, KladdeRediger, SendtVisning } from './Kladder.jsx'
import { BookingDetalje, byggeEnhedFarver } from './Kalender.jsx'

const FANER = { handles: 'handles', henvendelser: 'henvendelser', kladder: 'kladder' }

const dageSiden = (n) => {
  const d = Number(n)
  if (!Number.isFinite(d)) return ''
  if (d <= 0) return 'i dag'
  if (d === 1) return 'i går'
  return `for ${d} dage siden`
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

const HASTIGHED = {
  haster: { farve: tone.fejl, tekst: 'Haster' },
  snart: { farve: tone.advarsel, tekst: 'Snart' },
  normal: { farve: tone.neutral, tekst: 'Normal' },
}

const LEAD_STATUS = [
  { key: 'alle', label: 'Alle' },
  { key: 'ny', label: 'Nye' },
  { key: 'i_dialog', label: 'I dialog' },
  { key: 'tilbud', label: 'Tilbud sendt' },
  { key: 'vundet', label: 'Vundet' },
  { key: 'tabt', label: 'Tabt' },
]

function Fejlboks({ tekst }) {
  if (!tekst) return null
  return (
    <div style={{ background: tone.fejl.bg, color: tone.fejl.col, borderRadius: 10, padding: '10px 12px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
      {tekst}
    </div>
  )
}

function Kvittering({ tekst, onLuk }) {
  if (!tekst) return null
  return (
    <div style={{ ...card, marginTop: 16, padding: '10px 14px', background: tone.ok.bg, border: `1px solid ${tone.ok.col}33`, color: tone.ok.col, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ whiteSpace: 'pre-wrap' }}>{tekst}</span>
      <button onClick={onLuk} aria-label="Luk" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

function Felt({ label, multiline, hjaelp, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, color: c.sub }}>{label}</label>
      {multiline
        ? <textarea style={{ ...input, marginBottom: 0, minHeight: 110, resize: 'vertical' }} {...rest} />
        : <input style={{ ...input, marginBottom: 0 }} {...rest} />}
      {hjaelp && <div style={{ fontSize: 12.5, color: c.sub }}>{hjaelp}</div>}
    </div>
  )
}

// ---------------- Fane 1: Skal handles ----------------

function SkalHandles({ data, fejl, onAabnLead, onAabnKladde, onAabnBooking }) {
  if (fejl) return <div style={{ ...card, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>
  if (!data) return <div style={{ ...card, color: c.sub }}>Henter …</div>

  const poster = Array.isArray(data.poster) ? data.poster : []
  if (poster.length === 0) {
    return <TomTilstand tekst="Alt er fulgt op. Intet venter." />
  }

  function aabn(p) {
    if (p.type === 'lead_ny' || p.type === 'lead_kold') onAabnLead(p.id)
    else if (p.type === 'kladde') onAabnKladde(p.id)
    else if (p.type === 'booking_ny') onAabnBooking(p.id)
  }

  // Backend har sorteret efter hastighed og alder — raekkefoelgen bevares.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp(3) }}>
      {poster.map((p, i) => {
        const h = HASTIGHED[p.hastighed] || HASTIGHED.normal
        const haster = p.hastighed === 'haster'
        return (
          <Kort key={`${p.type}-${p.id}-${i}`} style={haster ? { borderLeft: `3px solid ${tone.fejl.col}` } : undefined}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {haster && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: tone.fejl.col, flexShrink: 0 }} />}
                <span style={{ fontSize: 16, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>{p.titel}</span>
              </div>
              <StatusChip tekst={h.tekst} farve={h.farve} />
            </div>
            {p.undertekst && (
              <div style={{ fontSize: 14, color: c.sub, marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{p.undertekst}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <Pilleknap lille onClick={() => aabn(p)}>{p.handling || 'Åbn'}</Pilleknap>
              <span style={{ fontSize: 13, color: c.sub }}>{dageSiden(p.dage)}</span>
              {p.kilde && <StatusChip tekst={p.kilde} farve={tone.neutral} />}
            </div>
          </Kort>
        )
      })}
    </div>
  )
}

// ---------------- Fane 2: Henvendelser ----------------

function LeadKort({ l, onHandling }) {
  const kunde = l.kunde
  return (
    <Kort style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>
            {l.navn || l.email || l.telefon || 'Ukendt henvendelse'}
          </div>
          {kunde && (
            <div style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>
              Kendt kunde: {kunde.firma || kunde.navn}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {l.kilde && <StatusChip tekst={l.kilde} farve={tone.neutral} />}
          <StatusChip status={l.status} />
        </div>
      </div>

      {/* Kundens egne ord er det vigtigste paa kortet. */}
      {l.besked && (
        <div style={{ background: c.bg, borderRadius: 10, padding: '10px 12px', fontSize: 14.5, color: c.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {l.besked}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, color: c.sub }}>
        <span>{dageSiden(l.dage_uden_aktivitet)} uden aktivitet</span>
        {l.email && <span>· {l.email}</span>}
        {l.telefon && <span>· {l.telefon}</span>}
        {Number(l.kladder || 0) > 0 && <span>· {l.kladder} udkast</span>}
      </div>

      {l.note && (
        <div style={{ fontSize: 13.5, color: c.sub, borderLeft: `2px solid ${c.line}`, paddingLeft: 10, whiteSpace: 'pre-wrap' }}>
          {l.note}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Pilleknap lille onClick={() => onHandling('svar', l)}>Skriv svar</Pilleknap>
        <Pilleknap variant="omrids" lille onClick={() => onHandling('status', l)}>Flyt / note</Pilleknap>
      </div>
    </Kort>
  )
}

function Henvendelser({ leads, antalPrStatus, filter, onFilter, fejl, onHandling, onNy }) {
  const muligheder = LEAD_STATUS.map((s) => ({
    key: s.key,
    label: s.key === 'alle'
      ? `Alle (${Object.values(antalPrStatus || {}).reduce((a, b) => a + Number(b || 0), 0)})`
      : `${s.label} (${Number((antalPrStatus || {})[s.key] || 0)})`,
  }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Segmentvaelger muligheder={muligheder} valgt={filter} onVaelg={onFilter} />
        <Pilleknap lille onClick={onNy}>+ Ny henvendelse</Pilleknap>
      </div>

      {fejl && <div style={{ ...card, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>}
      {!fejl && !leads && <div style={{ ...card, color: c.sub }}>Henter …</div>}
      {!fejl && leads && leads.length === 0 && (
        <TomTilstand tekst={filter === 'alle' ? 'Ingen henvendelser endnu.' : 'Ingen henvendelser med den status.'} />
      )}
      {!fejl && leads && leads.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: sp(4) }}>
          {leads.map((l) => <LeadKort key={l.id} l={l} onHandling={onHandling} />)}
        </div>
      )}
    </div>
  )
}

function LeadStatusDialog({ l, onClose, onFaerdig }) {
  const [status, setStatus] = useState(l.status || 'ny')
  const [note, setNote] = useState(l.note || '')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function gem() {
    setBusy(true); setFejl('')
    const args = { p_id: l.id }
    if (status !== l.status) args.p_status = status
    if (note.trim() !== (l.note || '')) args.p_note = note.trim()
    if (Object.keys(args).length === 1) { setBusy(false); onClose(); return }

    const { data, error } = await supabase.rpc('lead_opdater', args)
    setBusy(false)
    const f = tjek(data, error, 'Henvendelsen kunne ikke opdateres.')
    if (f) { setFejl(f); return }
    onFaerdig(`${data.navn || 'Henvendelsen'} er opdateret.`)
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={480} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 14 }}>
        {l.navn || l.email || 'Henvendelse'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 6 }}>Status</div>
          <Segmentvaelger
            muligheder={LEAD_STATUS.filter((s) => s.key !== 'alle')}
            valgt={status}
            onVaelg={setStatus}
          />
        </div>
        <Felt label="Note" multiline value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hvad blev aftalt?" />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={gem} disabled={busy}>{busy ? 'Gemmer …' : 'Gem'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

function LeadSvarDialog({ l, onClose, onFaerdig }) {
  const [emne, setEmne] = useState('')
  const [tekst, setTekst] = useState('')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function opret() {
    setBusy(true); setFejl('')
    const args = { p_lead_id: l.id, p_type: 'andet' }
    if (emne.trim()) args.p_emne = emne.trim()
    if (tekst.trim()) args.p_tekst = tekst.trim()
    const { data, error } = await supabase.rpc('lead_kladde_opret', args)
    setBusy(false)
    // Fx "Leaden har ingen email — tilføj en først …" vises ORDRET.
    const f = tjek(data, error, 'Udkastet kunne ikke oprettes.')
    if (f) { setFejl(f); return }
    onFaerdig('Udkastet ligger klar under Kladder.')
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={560} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 6 }}>
        Skriv svar til {l.navn || l.email || 'henvendelsen'}
      </div>
      <div style={{ fontSize: 14, color: c.sub, marginBottom: 14 }}>
        Enzo laver et udkast med kundens spørgsmål citeret. Du kan rette det bagefter under Kladder.
      </div>
      {l.besked && (
        <div style={{ background: c.bg, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: c.ink, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {l.besked}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Felt label="Emne (valgfrit)" value={emne} onChange={(e) => setEmne(e.target.value)} placeholder="Svar fra Casa Food" />
        <Felt
          label="Tekst (valgfrit)"
          multiline
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          placeholder="Lad stå tomt, så laver Enzo et udkast du kan rette."
        />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={opret} disabled={busy}>{busy ? 'Opretter …' : 'Opret udkast'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

function NyLeadDialog({ onClose, onFaerdig }) {
  const [navn, setNavn] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [besked, setBesked] = useState('')
  const [kilde, setKilde] = useState('telefon')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function opret() {
    setBusy(true); setFejl('')
    const { data, error } = await supabase.rpc('lead_opret', {
      p_navn: navn.trim() || null,
      p_email: email.trim() || null,
      p_telefon: telefon.trim() || null,
      p_besked: besked.trim() || null,
      p_kilde: kilde,
    })
    setBusy(false)
    const f = tjek(data, error, 'Henvendelsen kunne ikke oprettes.')
    if (f) { setFejl(f); return }
    onFaerdig(data.kendt_kunde
      ? 'Henvendelsen er oprettet og koblet til en kendt kunde.'
      : 'Henvendelsen er oprettet.')
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={520} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 6 }}>Ny henvendelse</div>
      <div style={{ fontSize: 14, color: c.sub, marginBottom: 14 }}>
        Til når nogen har ringet eller skrevet uden om systemet.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 6 }}>Kilde</div>
          <Segmentvaelger
            muligheder={[
              { key: 'telefon', label: 'Telefon' },
              { key: 'mail', label: 'Mail' },
              { key: 'manuel', label: 'Manuel' },
            ]}
            valgt={kilde}
            onVaelg={setKilde}
          />
        </div>
        <Felt label="Navn" value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Hvem henvendte sig?" />
        <Felt label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@eksempel.dk" type="email" />
        <Felt label="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="12 34 56 78" inputMode="tel" />
        <Felt label="Hvad spurgte de om?" multiline value={besked} onChange={(e) => setBesked(e.target.value)} placeholder="Skriv med kundens egne ord, hvis du kan." />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={opret} disabled={busy}>{busy ? 'Opretter …' : 'Opret'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------- Fane 3: Kladder ----------------

function KladdeFane({ kladder, fejl, onVaelg }) {
  const klar = (kladder || []).filter((k) => k.status === 'klar')
  const sendt = (kladder || []).filter((k) => k.status !== 'klar')

  if (fejl) return <div style={{ ...card, color: c.red, whiteSpace: 'pre-wrap' }}>{fejl}</div>
  if (!kladder) return <div style={{ ...card, color: c.sub }}>Henter …</div>
  if (kladder.length === 0) return <TomTilstand tekst="Ingen udkast endnu. Enzo laver dem, når der er noget at svare på." />

  const gitter = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: sp(4) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp(6) }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: c.sub, marginBottom: 10 }}>
          Klar til afsendelse ({klar.length})
        </div>
        {klar.length === 0
          ? <TomTilstand tekst="Intet venter på dig her." />
          : <div style={gitter}>{klar.map((k) => <KladdeKort key={k.id} kladde={k} onClick={() => onVaelg(k)} />)}</div>}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: c.sub, marginBottom: 10 }}>
          Sendt ({sendt.length})
        </div>
        {sendt.length === 0
          ? <TomTilstand tekst="Ingen sendte mails endnu." />
          : <div style={gitter}>{sendt.map((k) => <KladdeKort key={k.id} kladde={k} onClick={() => onVaelg(k)} />)}</div>}
      </div>
    </div>
  )
}

// ---------------- Hub ----------------

export default function Kundekontakt() {
  const nav = useNavigate()
  const sti = useLocation()

  // Dyb-link: /kundekontakt?fane=kladder (bruges bl.a. fra forsiden).
  const oensketFane = new URLSearchParams(sti.search).get('fane')
  const [fane, setFane] = useState(FANER[oensketFane] || FANER.handles)
  useEffect(() => {
    if (oensketFane && FANER[oensketFane]) setFane(FANER[oensketFane])
  }, [oensketFane])

  const [hub, setHub] = useState(null)
  const [hubFejl, setHubFejl] = useState('')

  const [leads, setLeads] = useState(null)
  const [leadFejl, setLeadFejl] = useState('')
  const [leadFilter, setLeadFilter] = useState('alle')
  const [antalPrStatus, setAntalPrStatus] = useState({})

  const [kladder, setKladder] = useState(null)
  const [kladdeFejl, setKladdeFejl] = useState('')

  const [kvittering, setKvittering] = useState('')

  // Dialoger
  const [leadStatus, setLeadStatus] = useState(null)
  const [leadSvar, setLeadSvar] = useState(null)
  const [nyLead, setNyLead] = useState(false)
  const [valgtKladde, setValgtKladde] = useState(null)
  const [booking, setBooking] = useState(null)
  // Klik fra "Skal handles" skal kunne aabne en post der endnu ikke er hentet
  // (fx fordi henvendelses-listen var filtreret). Vi husker id'et og aabner,
  // saa snart listen er indlaest.
  const [venterLead, setVenterLead] = useState(null)
  const [venterKladde, setVenterKladde] = useState(null)
  const [farver, setFarver] = useState(() => new Map())
  const [aabnFejl, setAabnFejl] = useState('')

  const hentHub = useCallback(async () => {
    setHubFejl('')
    const { data, error } = await supabase.rpc('hub_indbakke')
    const f = tjek(data, error, 'Kunne ikke hente indbakken.')
    if (f) { setHubFejl(f); return }
    setHub(data)
  }, [])

  const hentLeads = useCallback(async (status) => {
    setLeadFejl('')
    const args = status && status !== 'alle' ? { p_status: status } : {}
    const { data, error } = await supabase.rpc('lead_liste', args)
    const f = tjek(data, error, 'Kunne ikke hente henvendelserne.')
    if (f) { setLeadFejl(f); return }
    setLeads(data.leads || [])
    setAntalPrStatus(data.antal_pr_status || {})
  }, [])

  const hentKladder = useCallback(async () => {
    setKladdeFejl('')
    const { data, error } = await supabase.rpc('kladde_liste')
    const f = tjek(data, error, 'Kunne ikke hente kladderne.')
    if (f) { setKladdeFejl(f); return }
    setKladder(data.kladder || [])
  }, [])

  useEffect(() => { hentHub() }, [hentHub])
  useEffect(() => { hentLeads(leadFilter) }, [hentLeads, leadFilter])
  useEffect(() => { hentKladder() }, [hentKladder])
  useEffect(() => {
    let alive = true
    supabase.rpc('enheder_liste').then(({ data, error }) => {
      if (!alive || error || !Array.isArray(data)) return
      setFarver(byggeEnhedFarver(data))
    })
    return () => { alive = false }
  }, [])

  function altOpdater() { hentHub(); hentLeads(leadFilter); hentKladder() }

  useEffect(() => {
    if (!venterLead || !leads) return
    const l = leads.find((x) => x.id === venterLead)
    if (l) { setLeadStatus(l); setVenterLead(null) }
  }, [venterLead, leads])

  useEffect(() => {
    if (!venterKladde || !kladder) return
    const k = kladder.find((x) => x.id === venterKladde)
    if (k) { setValgtKladde(k); setVenterKladde(null) }
  }, [venterKladde, kladder])

  // Booking aabnes i den eksisterende detaljemodal — samme greb som Forsiden.
  async function aabnBooking(id) {
    setAabnFejl('')
    const { data, error } = await supabase.rpc('kalender_data')
    const f = tjek(data, error, 'Kunne ikke hente bookingen.')
    if (f) { setAabnFejl(f); return }
    const b = (data.bookinger || []).find((x) => x.booking_id === id)
    if (!b) { setAabnFejl('Bookingen blev ikke fundet i kalenderen.'); return }
    setBooking(b)
  }

  // Badges skal vise det SAMME tal som fanen selv viser, ellers ser de forkerte ud.
  // Henvendelser talte foer 'ubesvarede + kolde' (kraever opfoelgning) mens fanen
  // viser "Alle (N)" = alle leads — to forskellige tal, som tilfaeldigvis kunne
  // staa stille samtidig. Nu kommer badgen fra samme kilde som indholdet.
  const faner = useMemo(() => {
    const venter = Number(hub?.poster?.length || 0)
    const alleLeads = Object.values(antalPrStatus || {}).reduce((a, b) => a + Number(b || 0), 0)
    const klarKladder = (kladder || []).filter((k) => k.status === 'klar').length
    return [
      { key: FANER.handles, label: venter > 0 ? `Skal handles (${venter})` : 'Skal handles' },
      { key: FANER.henvendelser, label: `Henvendelser (${alleLeads})` },
      { key: FANER.kladder, label: `Kladder (${klarKladder})` },
    ]
  }, [hub, antalPrStatus, kladder])

  function skiftFane(k) {
    setFane(k)
    // Hold URL'en i sync, saa dyb-links og genindlaesning peger samme sted.
    nav(`/kundekontakt?fane=${k}`, { replace: true })
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 500 }}>Kundekontakt</h1>
      <p style={{ color: c.sub, marginTop: 0, fontSize: 15 }}>
        Alt fra kunderne ét sted: hvad der venter, hvem der har skrevet, og de udkast Enzo har lavet.
      </p>

      <div style={{ marginTop: 16 }}>
        <Segmentvaelger muligheder={faner} valgt={fane} onVaelg={skiftFane} />
      </div>

      <Kvittering tekst={kvittering} onLuk={() => setKvittering('')} />
      {aabnFejl && <div style={{ marginTop: 12, fontSize: 13.5, color: c.red, whiteSpace: 'pre-wrap' }}>{aabnFejl}</div>}

      <div style={{ marginTop: 16 }}>
        {fane === FANER.handles && (
          <SkalHandles
            data={hub}
            fejl={hubFejl}
            onAabnLead={(id) => {
              setLeadFilter('alle')
              skiftFane(FANER.henvendelser)
              setVenterLead(id)
            }}
            onAabnKladde={(id) => {
              skiftFane(FANER.kladder)
              setVenterKladde(id)
            }}
            onAabnBooking={aabnBooking}
          />
        )}

        {fane === FANER.henvendelser && (
          <Henvendelser
            leads={leads}
            antalPrStatus={antalPrStatus}
            filter={leadFilter}
            onFilter={setLeadFilter}
            fejl={leadFejl}
            onNy={() => setNyLead(true)}
            onHandling={(hvad, l) => {
              setKvittering('')
              if (hvad === 'svar') setLeadSvar(l)
              else setLeadStatus(l)
            }}
          />
        )}

        {fane === FANER.kladder && (
          <KladdeFane
            kladder={kladder}
            fejl={kladdeFejl}
            onVaelg={(k) => { setKvittering(''); setValgtKladde(k) }}
          />
        )}
      </div>

      {leadStatus && (
        <LeadStatusDialog
          l={leadStatus}
          onClose={() => setLeadStatus(null)}
          onFaerdig={(t) => { setLeadStatus(null); setKvittering(t); altOpdater() }}
        />
      )}
      {leadSvar && (
        <LeadSvarDialog
          l={leadSvar}
          onClose={() => setLeadSvar(null)}
          onFaerdig={(t) => { setLeadSvar(null); setKvittering(t); altOpdater() }}
        />
      )}
      {nyLead && (
        <NyLeadDialog
          onClose={() => setNyLead(false)}
          onFaerdig={(t) => { setNyLead(false); setKvittering(t); altOpdater() }}
        />
      )}

      {/* Sendte mails er skrivebeskyttede — derfor to forskellige visninger. */}
      {valgtKladde && valgtKladde.status === 'sendt' && (
        <SendtVisning kladde={valgtKladde} onClose={() => setValgtKladde(null)} />
      )}
      {valgtKladde && valgtKladde.status !== 'sendt' && (
        <KladdeRediger
          kladde={valgtKladde}
          onClose={() => setValgtKladde(null)}
          onDone={(t) => { setValgtKladde(null); setKvittering(t); altOpdater() }}
          onRefresh={hentKladder}
        />
      )}

      {booking && (
        <BookingDetalje
          booking={booking}
          enhedFarve={farver.get(booking.enhed)}
          onClose={() => setBooking(null)}
          onVagtChange={altOpdater}
        />
      )}
    </div>
  )
}
