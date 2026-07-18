import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font, sp } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'
import { tone } from '../ui.js'

// Dansk beloeb: 180200 -> "180.200 kr". Tomt/ugyldigt -> "0 kr".
const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const fmtDato = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}

function LoyalBadge() {
  return <StatusChip tekst="★ Loyal" farve={tone.advarsel} />
}

// Momsloven kraever koebers adresse paa fakturaen. Uden adresse kan kunden ikke faktureres.
function ManglerAdresseBadge() {
  return <StatusChip tekst="⚠ Mangler adresse" farve={tone.fejl} />
}

function TypeBadge({ type }) {
  const virk = type === 'virksomhed'
  return <StatusChip tekst={virk ? 'Virksomhed' : 'Privat'} farve={virk ? tone.aktiv : tone.neutral} />
}

function StatusPill({ status, tekst }) {
  return <StatusChip status={status} tekst={tekst} />
}

function Noegletal({ label, value }) {
  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: c.sub }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 500, marginTop: 4 }}>{value}</div>
    </div>
  )
}

// crm_data giver pr. booking 'koncepter' (array af pæne navne, fuldt sæt) ved
// siden af det gamle enkelt-felt 'koncept'. Vis hele sættet; fald tilbage på
// 'koncept' hvis arrayet mangler/er tomt (fx et gammelt cachet svar).
const konceptListe = (b) => (Array.isArray(b?.koncepter) ? b.koncepter.filter(Boolean) : [])
const konceptTekst = (b) => {
  const arr = konceptListe(b)
  return arr.length > 0 ? arr.join(', ') : (b?.koncept || '—')
}

function BookingListe({ titel, rows, tom }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 8 }}>{titel}</div>
      {(!rows || rows.length === 0) ? (
        <div style={{ padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: 12, color: c.sub, fontSize: 15, background: c.card }}>{tom}</div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {rows.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 120, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtDato(b.dato)}</div>
                <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>
                  <span style={{ color: c.slate2, fontWeight: 500 }}>{konceptListe(b).length > 1 ? 'Koncepter:' : 'Koncept:'}</span> {konceptTekst(b)}
                </div>
              </div>
              <div style={{ fontSize: 13, color: c.slate2, minWidth: 74, textAlign: 'right' }}>{b.covers != null ? `${b.covers} kuv.` : '—'}</div>
              <div style={{ fontSize: 14, fontWeight: 500, minWidth: 90, textAlign: 'right' }}>{kr(b.beloeb)}</div>
              <StatusPill status={b.status} tekst={b.status_tekst} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Redigerbart felt i kundeprofilen. multiline -> textarea (noter).
function RedigerFelt({ label, value, onChange, placeholder, multiline }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: c.sub }}>{label}</label>
      {multiline ? (
        <textarea
          style={{ ...input, marginBottom: 0, minHeight: 72, resize: 'vertical' }}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      ) : (
        <input style={{ ...input, marginBottom: 0 }} value={value} onChange={onChange} placeholder={placeholder} />
      )}
    </div>
  )
}

const tomForm = (k) => ({
  navn: k.navn || '', firma: k.firma || '', email: k.email || '',
  telefon: k.telefon || '', adresse: k.adresse || '', noter: k.noter || '' })

function KundeProfil({ kunde, onClose, onSaved }) {
  const [rediger, setRediger] = useState(false)
  const [form, setForm] = useState(() => tomForm(kunde))
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  // Skift af valgt kunde -> nulstil form/redigeringstilstand.
  useEffect(() => {
    setForm(tomForm(kunde))
    setRediger(false)
    setFejl('')
  }, [kunde.id])

  const saet = (felt) => (e) => setForm((f) => ({ ...f, [felt]: e.target.value }))

  function annuller() {
    setForm(tomForm(kunde))
    setRediger(false)
    setFejl('')
  }

  async function gem() {
    setFejl('')
    // Byg payload med DANSKE feltnavne. Kun de felter brugeren faktisk aendrede sendes.
    const payload = { id: kunde.id }
    for (const felt of ['navn', 'firma', 'email', 'telefon', 'adresse', 'noter']) {
      const ny = form[felt].trim()
      const gl = (kunde[felt] || '').trim()
      if (ny === gl) continue
      // Backend ignorerer tomt navn (navnet kan ikke blankes) -> undlad at sende det.
      if (felt === 'navn' && ny === '') continue
      payload[felt] = ny
    }
    const aendredeFelter = Object.keys(payload).filter((k) => k !== 'id')
    if (aendredeFelter.length === 0) { setRediger(false); return }

    setBusy(true)
    const { data, error } = await supabase.rpc('admin_handling', {
      p_aktion: 'kunde_opdater',
      p_payload: payload })
    setBusy(false)

    // En fejl kan komme som `error` ELLER som `data.ok === false`. Tjek begge, vis teksten ORDRET.
    if (error) { setFejl(error.message); return }
    if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke gemme ændringerne.'); return }

    // Succes: giv de aendrede felter videre, saa liste + profil opdateres med det samme.
    const aendringer = {}
    for (const k of aendredeFelter) aendringer[k] = payload[k]
    setRediger(false)
    onSaved(kunde.id, aendringer)
  }

  const manglerAdresse = !(kunde.adresse && String(kunde.adresse).trim())

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50, fontFamily: font }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 600, maxWidth: '100%', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {rediger ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <RedigerFelt label="Navn" value={form.navn} onChange={saet('navn')} placeholder="Navn" />
                <RedigerFelt label="Firma" value={form.firma} onChange={saet('firma')} placeholder="Firma (valgfri)" />
              </div>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>{kunde.navn}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <TypeBadge type={kunde.type} />
                  {kunde.loyal && <LoyalBadge />}
                  {manglerAdresse && <ManglerAdresseBadge />}
                  {kunde.firma && <span style={{ fontSize: 13, color: c.sub }}>{kunde.firma}</span>}
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!rediger && (
              <button onClick={() => setRediger(true)} style={{ ...btnGhost, padding: '8px 14px' }}>Rediger</button>
            )}
            <button onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, padding: 0 }}>×</button>
          </div>
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
          <div style={{ fontSize: 12, color: c.sub, marginBottom: 10 }}>Kontakt</div>
          {rediger ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <RedigerFelt label="Email" value={form.email} onChange={saet('email')} placeholder="Email" />
              <RedigerFelt label="Telefon" value={form.telefon} onChange={saet('telefon')} placeholder="Telefon" />
              <RedigerFelt label="Adresse" value={form.adresse} onChange={saet('adresse')} placeholder="Fakturaadresse (kræves for at fakturere)" />
              <RedigerFelt label="Noter" value={form.noter} onChange={saet('noter')} placeholder="Interne noter" multiline />

              {fejl && (
                <div style={{ ...card, padding: '10px 14px', background: '#FBF1EF', border: `1px solid #E0B6AF`, color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{fejl}</div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button onClick={gem} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
                  {busy ? 'Gemmer …' : 'Gem'}
                </button>
                <button onClick={annuller} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>Annuller</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Kontaktlinje label="Email" value={kunde.email} />
              <Kontaktlinje label="Telefon" value={kunde.telefon} />
              <Kontaktlinje label="Adresse" value={kunde.adresse} advarsel={manglerAdresse} />
              <Kontaktlinje label="Oprettet" value={fmtDato(kunde.oprettet)} />
              {kunde.noter && (
                <div style={{ marginTop: 4, padding: '10px 14px', background: c.bg, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: c.sub }}>Noter</div>
                  <div style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>{kunde.noter}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <BookingListe titel="Kommende bookinger" rows={kunde.kommende} tom="Ingen kommende bookinger." />
        <BookingListe titel="Tidligere bookinger" rows={kunde.tidligere} tom="Ingen tidligere bookinger." />
      </div>
    </div>
  )
}

function Kontaktlinje({ label, value, advarsel }) {
  return (
    <div style={{ fontSize: 14, display: 'flex', gap: 8 }}>
      <span style={{ color: c.sub, minWidth: 72 }}>{label}</span>
      {advarsel ? (
        <span style={{ fontWeight: 500, color: c.red }}>Mangler — kræves for at fakturere</span>
      ) : (
        <span style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{value || '—'}</span>
      )}
    </div>
  )
}

function KundeKort({ kunde, onClick }) {
  const manglerAdresse = !(kunde.adresse && String(kunde.adresse).trim())
  return (
    <button
      onClick={onClick}
      style={{
        ...card, textAlign: 'left', cursor: 'pointer', fontFamily: font, display: 'flex', flexDirection: 'column', gap: 0,
        borderLeft: kunde.loyal ? `4px solid ${c.blue}` : (manglerAdresse ? `4px solid ${c.red}` : `1px solid ${c.line}`) }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kunde.navn}</div>
          {kunde.firma && <div style={{ fontSize: 13, color: c.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kunde.firma}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {kunde.loyal && <LoyalBadge />}
          {manglerAdresse && <ManglerAdresseBadge />}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 500 }}>{kr(kunde.omsaetning_total)}</div>
        <div style={{ fontSize: 13, color: c.slate2 }}>{kunde.antal_events ?? 0} event{kunde.antal_events === 1 ? '' : 's'}</div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.line}`, fontSize: 12.5 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: c.sub }}>Næste</div>
          <div style={{ fontWeight: 500 }}>{fmtDato(kunde.naeste_event)}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: c.sub }}>Sidste</div>
          <div style={{ fontWeight: 500 }}>{fmtDato(kunde.sidste_event)}</div>
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

  // Efter en gemt aendring: opdatér liste + aaben profil lokalt (danske feltnavne matcher
  // kundeobjektet direkte), og genindlaes fra serveren saa data er autoritativt.
  const handleSaved = useCallback((id, aendringer) => {
    setKunder((prev) => (prev ? prev.map((k) => (k.id === id ? { ...k, ...aendringer } : k)) : prev))
    setValgt((prev) => (prev && prev.id === id ? { ...prev, ...aendringer } : prev))
    load()
  }, [load])

  // Sorteret efter omsaetning (hoejeste foerst), filtreret paa navn/firma.
  const synlige = useMemo(() => {
    const q = soeg.trim().toLowerCase()
    return (kunder || [])
      .filter((k) => !q || (k.navn || '').toLowerCase().includes(q) || (k.firma || '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (b.omsaetning_total || 0) - (a.omsaetning_total || 0))
  }, [kunder, soeg])

  const total = kunder?.length ?? 0
  const udenAdresse = (kunder || []).filter((k) => !(k.adresse && String(k.adresse).trim())).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Kunder</h1>
        {kunder && <span style={{ color: c.sub, fontSize: 14 }}>{total} kunde{total === 1 ? '' : 'r'}</span>}
        {kunder && udenAdresse > 0 && (
          <span style={{ background: '#F6E7E4', color: '#8C3E36', fontSize: 12.5, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
            ⚠ {udenAdresse} mangler adresse
          </span>
        )}
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

      {valgt && <KundeProfil kunde={valgt} onClose={() => setValgt(null)} onSaved={handleSaved} />}
    </div>
  )
}
