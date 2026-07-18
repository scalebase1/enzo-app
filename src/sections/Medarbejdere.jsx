import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, SUPABASE_ANON } from '../supabaseClient.js'
import { c, card, input, sp, tone, radius } from '../ui.js'
import { Kort, StatusChip, Pilleknap, Dialog, TomTilstand } from '../komponenter/index.jsx'

const ONBOARD = 'https://vakumjnnmfyqkcoxqcra.supabase.co/functions/v1/medarbejder-onboard'

const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const timerFmt = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 1 })} t`

// medarbejder_slet saetter onboarding_status='inaktiv'. Nyoprettede har ogsaa
// active=false (de afventer invitation), saa vi maa IKKE bruge 'aktiv' til at
// afgoere om nogen er fjernet — kun status'en.
const erFjernet = (m) => m.onboarding_status === 'inaktiv'

// Backendens fejl skal vises ORDRET — men kun hvis den faktisk er en tekst.
// Er den tom, et objekt eller noget uforstaaeligt, viser vi en menneskelig
// besked i stedet. En bruger skal aldrig se "{}" eller "[object Object]".
function menneskeligFejl(kandidat, reserve) {
  if (typeof kandidat === 'string' && kandidat.trim()) return kandidat.trim()
  return reserve
}

// Uden login endnu → kan inviteres.
const kanInviteres = (status) => status === 'afventer_medarbejder' || status === 'afventer_godkendelse'

function Initialer({ navn, daempet }) {
  const bogstaver = String(navn || '?')
    .trim().split(/\s+/).slice(0, 2).map((d) => d[0] || '').join('').toUpperCase() || '?'
  return (
    <div
      aria-hidden
      style={{
        width: 40, height: 40, flexShrink: 0, borderRadius: radius.pille,
        background: daempet ? tone.neutral.bg : tone.aktiv.bg,
        color: daempet ? tone.neutral.col : tone.aktiv.col,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 500,
      }}
    >
      {bogstaver}
    </div>
  )
}

function Noegletal({ label, vaerdi }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: c.sub }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: c.ink, marginTop: 1 }}>{vaerdi}</div>
    </div>
  )
}

function Kontaktlinje({ ikon, vaerdi, tom }) {
  return (
    <div style={{ fontSize: 14, color: vaerdi ? c.text : c.sub, display: 'flex', gap: 8, minWidth: 0 }}>
      <span style={{ color: c.sub, width: 16, flexShrink: 0 }}>{ikon}</span>
      <span style={{ overflowWrap: 'anywhere' }}>{vaerdi || tom}</span>
    </div>
  )
}

function MedarbejderKort({ m, onRediger, onFjern, onInviter, busy }) {
  const fjernet = erFjernet(m)
  return (
    <Kort style={{ opacity: fjernet ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Initialer navn={m.navn} daempet={fjernet} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>{m.navn}</div>
          <div style={{ marginTop: 4 }}>
            {/* Overstyring bevaret: onboarding 'aktiv' men active=false => "inaktiv" */}
            {m.onboarding_status === 'aktiv' && !m.aktiv
              ? <StatusChip status="inaktiv" tekst="inaktiv" />
              : <StatusChip status={m.onboarding_status} tekst={m.status_tekst} />}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Kontaktlinje ikon="☎" vaerdi={m.telefon} tom="Intet telefonnummer" />
        <Kontaktlinje ikon="✉" vaerdi={m.email} tom="Ingen email" />
      </div>

      {!m.har_login && !fjernet && (
        <div style={{ background: tone.advarsel.bg, color: tone.advarsel.col, borderRadius: 10, padding: '8px 12px', fontSize: 13.5 }}>
          Har ikke sat adgangskode endnu
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, borderTop: `1px solid ${c.line}`, paddingTop: 12 }}>
        <Noegletal label="Timeløn" vaerdi={m.timeloen != null ? `${kr(m.timeloen)}/t` : '—'} />
        <Noegletal label="Timer denne måned" vaerdi={timerFmt(m.timer_denne_maaned)} />
        <Noegletal label="Løn denne måned" vaerdi={kr(m.loen_denne_maaned)} />
        <Noegletal label="Kommende vagter" vaerdi={Number(m.kommende_vagter || 0)} />
      </div>

      {!fjernet && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pilleknap variant="omrids" lille onClick={() => onRediger(m)} disabled={!!busy}>Rediger</Pilleknap>
          {kanInviteres(m.onboarding_status) && (
            <Pilleknap lille onClick={() => onInviter(m)} disabled={!!busy}>Inviter</Pilleknap>
          )}
          <Pilleknap variant="omrids" lille fare onClick={() => onFjern(m)} disabled={!!busy}>Fjern</Pilleknap>
        </div>
      )}
    </Kort>
  )
}

export default function Medarbejdere() {
  const [liste, setListe] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [kvittering, setKvittering] = useState('')
  const [advarsel, setAdvarsel] = useState('')

  // Dialoger
  const [nyAaben, setNyAaben] = useState(false)
  const [rediger, setRediger] = useState(null)     // medarbejder-raekke
  const [fjern, setFjern] = useState(null)         // medarbejder-raekke
  const [inviter, setInviter] = useState(null)     // medarbejder-raekke

  const [busy, setBusy] = useState(null)
  const [fejl, setFejl] = useState('')             // backendens tekst, ORDRET

  const load = useCallback(async ({ foerste = false } = {}) => {
    if (foerste) setLoading(true)
    setErr('')
    const { data, error } = await supabase.rpc('medarbejdere_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(menneskeligFejl(data?.fejl, 'Kunne ikke hente listen.')); return }
    setListe(data.medarbejdere || [])
  }, [])

  useEffect(() => { load({ foerste: true }) }, [load])

  function tjek(data, error, fallback) {
    if (error) return menneskeligFejl(error.message, fallback)
    if (!data || data.ok === false) return menneskeligFejl(data?.fejl, fallback)
    return null
  }

  // Fjernede nederst; ellers bevares RPC'ens orden (aktive foerst, saa navn).
  const sorteret = useMemo(() => {
    const l = (liste || []).map((m, i) => ({ m, i }))
    l.sort((a, b) => (erFjernet(a.m) - erFjernet(b.m)) || (a.i - b.i))
    return l.map((x) => x.m)
  }, [liste])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 500 }}>Medarbejdere</h1>
          <p style={{ color: c.sub, marginTop: 0, fontSize: 15 }}>
            Overblik over dit hold. Inviter nye — de sætter selv deres adgangskode via linket.
          </p>
        </div>
        <Pilleknap onClick={() => { setNyAaben(true); setFejl('') }}>+ Ny medarbejder</Pilleknap>
      </div>

      {kvittering && (
        <div style={{ ...card, marginTop: 16, padding: '10px 14px', background: tone.ok.bg, border: `1px solid ${tone.ok.col}33`, color: tone.ok.col, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span>{kvittering}</span>
          <button onClick={() => setKvittering('')} aria-label="Luk" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
      {/* Backendens 'advarsel' vises ORDRET — fx at vagter nu staar ubemandede. */}
      {advarsel && (
        <div style={{ ...card, marginTop: 12, padding: '10px 14px', background: tone.advarsel.bg, border: `1px solid ${tone.advarsel.col}33`, color: tone.advarsel.col, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, whiteSpace: 'pre-wrap' }}>
          <span>{advarsel}</span>
          <button onClick={() => setAdvarsel('')} aria-label="Luk" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter medarbejdere …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red, whiteSpace: 'pre-wrap' }}>{err}</div>}

      {!loading && !err && liste && (
        liste.length === 0 ? (
          <div style={{ marginTop: 16 }}><TomTilstand tekst="Ingen medarbejdere endnu. Tilføj den første med “+ Ny medarbejder”." /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: sp(4), marginTop: 16 }}>
            {sorteret.map((m) => (
              <MedarbejderKort
                key={m.id}
                m={m}
                busy={busy}
                onRediger={(x) => { setRediger(x); setFejl('') }}
                onFjern={(x) => { setFjern(x); setFejl('') }}
                onInviter={(x) => { setInviter(x); setFejl('') }}
              />
            ))}
          </div>
        )
      )}

      {nyAaben && (
        <NyMedarbejder
          onClose={() => setNyAaben(false)}
          onFaerdig={(besked) => { setNyAaben(false); setKvittering(besked); load() }}
        />
      )}

      {rediger && (
        <RedigerMedarbejder
          m={rediger}
          onClose={() => setRediger(null)}
          onFaerdig={(besked) => { setRediger(null); setKvittering(besked); load() }}
        />
      )}

      {fjern && (
        <FjernMedarbejder
          m={fjern}
          busy={busy === fjern.id}
          fejl={fejl}
          onClose={() => { setFjern(null); setFejl('') }}
          onBekraeft={async () => {
            setBusy(fjern.id); setFejl('')
            const { data, error } = await supabase.rpc('medarbejder_slet', { p_id: fjern.id })
            setBusy(null)
            const f = tjek(data, error, 'Kunne ikke fjerne medarbejderen.')
            if (f) { setFejl(f); return }
            setKvittering(menneskeligFejl(data.besked, `${data.navn || 'Medarbejderen'} er fjernet.`))
            setAdvarsel(typeof data.advarsel === 'string' ? data.advarsel : '')
            setFjern(null)
            load()
          }}
        />
      )}

      {inviter && (
        <InviterMedarbejder
          m={inviter}
          onClose={() => setInviter(null)}
          onFaerdig={(besked) => { setInviter(null); setKvittering(besked); load() }}
        />
      )}
    </div>
  )
}

// ---------------- Dialoger ----------------

function Felt({ label, hjaelp, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, color: c.sub }}>{label}</label>
      <input style={{ ...input, marginBottom: 0 }} {...rest} />
      {hjaelp && <div style={{ fontSize: 12.5, color: c.sub }}>{hjaelp}</div>}
    </div>
  )
}

function Fejlboks({ tekst }) {
  if (!tekst) return null
  return (
    <div style={{ background: tone.fejl.bg, color: tone.fejl.col, borderRadius: 10, padding: '10px 12px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
      {tekst}
    </div>
  )
}

function NyMedarbejder({ onClose, onFaerdig }) {
  const [navn, setNavn] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [loen, setLoen] = useState('')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  // Ét trin: navn, telefon, email og timeloen gemmes alle af medarbejder_opret.
  // Invitationen er nu et separat, bevidst valg bagefter ("Inviter" paa kortet)
  // — den er ikke laengere det, der faar emailen paa plads.
  async function opret() {
    if (busy) return
    setBusy(true); setFejl('')

    const payload = { navn: navn.trim(), timeloen: loen.trim() || '0' }
    if (telefon.trim()) payload.telefon = telefon.trim()
    if (email.trim()) payload.email = email.trim()

    const { data, error } = await supabase.rpc('admin_handling', {
      p_aktion: 'medarbejder_opret',
      p_payload: payload,
    })
    setBusy(false)

    if (error) { setFejl(menneskeligFejl(error.message, 'Medarbejderen kunne ikke oprettes.')); return }
    if (!data || data.ok === false) {
      setFejl(menneskeligFejl(data?.fejl, 'Medarbejderen kunne ikke oprettes.'))
      return
    }

    const n = data.navn || navn.trim()
    onFaerdig(data.email
      ? `${n} er oprettet med ${data.email}. Tryk “Inviter” på kortet for at sende login-linket.`
      : `${n} er oprettet. Tilføj en email og tryk “Inviter”, når ${n} skal kunne logge ind.`)
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={460} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 14 }}>Ny medarbejder</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Felt label="Navn" value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Fulde navn" />
        <Felt label="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="12 34 56 78" inputMode="tel" />
        <Felt
          label="Email (valgfri)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="navn@eksempel.dk"
          type="email"
          hjaelp="Gemmes med det samme. Invitationen sender du bagefter med “Inviter” på kortet."
        />
        <Felt label="Timeløn (kr.)" value={loen} onChange={(e) => setLoen(e.target.value)} placeholder="150" inputMode="decimal" />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <Pilleknap onClick={opret} disabled={busy}>{busy ? 'Opretter …' : 'Opret'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

function RedigerMedarbejder({ m, onClose, onFaerdig }) {
  const [navn, setNavn] = useState(m.navn || '')
  const [telefon, setTelefon] = useState(m.telefon || '')
  const [loen, setLoen] = useState(m.timeloen != null ? String(m.timeloen) : '')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function gem() {
    setBusy(true); setFejl('')
    // Kun de felter der faktisk er aendret.
    const payload = { id: m.id }
    const n = navn.trim()
    if (n && n !== (m.navn || '')) payload.navn = n
    if (telefon.trim() !== (m.telefon || '')) payload.telefon = telefon.trim()
    const l = loen.trim()
    if (l !== (m.timeloen != null ? String(m.timeloen) : '')) payload.timeloen = l

    if (Object.keys(payload).length === 1) { setBusy(false); onClose(); return }

    const { data, error } = await supabase.rpc('admin_handling', {
      p_aktion: 'medarbejder_opdater',
      p_payload: payload,
    })
    setBusy(false)
    if (error) { setFejl(menneskeligFejl(error.message, 'Ændringerne kunne ikke gemmes.')); return }
    if (!data || data.ok === false) { setFejl(menneskeligFejl(data?.fejl, 'Ændringerne kunne ikke gemmes.')); return }
    onFaerdig(`${n || m.navn} er opdateret.`)
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={460} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 14 }}>Rediger {m.navn}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Felt label="Navn" value={navn} onChange={(e) => setNavn(e.target.value)} />
        <Felt label="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="12 34 56 78" inputMode="tel" />
        <Felt label="Timeløn (kr.)" value={loen} onChange={(e) => setLoen(e.target.value)} inputMode="decimal" />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <Pilleknap onClick={gem} disabled={busy}>{busy ? 'Gemmer …' : 'Gem'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}

function FjernMedarbejder({ m, busy, fejl, onClose, onBekraeft }) {
  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={460} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 10 }}>Fjern {m.navn}?</div>
      <div style={{ fontSize: 15, color: c.text, lineHeight: 1.5 }}>
        {m.navn} bliver <strong style={{ fontWeight: 500 }}>inaktiv</strong> og kan ikke længere få vagter eller logge ind.
      </div>
      <div style={{ background: tone.neutral.bg, color: c.text, borderRadius: 10, padding: '10px 12px', fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
        Det er <strong style={{ fontWeight: 500 }}>ikke</strong> en sletning: løn, timer og hele historikken bevares,
        så tidligere lønopgørelser og regnskab er uændrede.
        {Number(m.kommende_vagter || 0) > 0 && (
          <> {m.navn} står på {m.kommende_vagter} kommende vagt{Number(m.kommende_vagter) === 1 ? '' : 'er'} — de bliver ubemandede.</>
        )}
      </div>
      {fejl && <div style={{ marginTop: 12 }}><Fejlboks tekst={fejl} /></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <Pilleknap fare onClick={onBekraeft} disabled={busy}>{busy ? 'Fjerner …' : `Ja, fjern ${m.navn}`}</Pilleknap>
        <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
      </div>
    </Dialog>
  )
}

function InviterMedarbejder({ m, onClose, onFaerdig }) {
  const [email, setEmail] = useState(m.email || '')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  async function send() {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) { setFejl('Skriv en gyldig email.'); return }
    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    if (!tok) { setFejl('Session udløbet — genindlæs.'); return }

    setBusy(true); setFejl('')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(ONBOARD, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: m.id, email: e, redirectTo: window.location.origin }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const raw = await res.text()
      let d = null
      try { d = JSON.parse(raw) } catch { /* ignore */ }
      setBusy(false)
      if (!res.ok || !d || d.ok === false) {
        setFejl(menneskeligFejl(d && d.fejl, 'Invitationen kunne ikke sendes. Prøv igen om lidt.'))
        return
      }
      onFaerdig(menneskeligFejl(d.besked, 'Invitation sendt.'))
    } catch (er) {
      clearTimeout(timer); setBusy(false)
      setFejl(er && er.name === 'AbortError' ? 'Timeout — prøv igen.' : 'Uventet fejl — prøv igen.')
    }
  }

  return (
    <Dialog onClose={busy ? undefined : onClose} bredde={440} lukVedBackdrop={!busy}>
      <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, marginBottom: 10 }}>Inviter {m.navn}</div>
      <div style={{ fontSize: 14, color: c.sub, marginBottom: 12 }}>
        {m.navn} får et link og sætter selv sin adgangskode.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Felt label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@eksempel.dk" type="email" />
        <Fejlboks tekst={fejl} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Pilleknap onClick={send} disabled={busy}>{busy ? 'Sender …' : 'Send invitation'}</Pilleknap>
          <Pilleknap variant="omrids" onClick={onClose} disabled={busy}>Annuller</Pilleknap>
        </div>
      </div>
    </Dialog>
  )
}
