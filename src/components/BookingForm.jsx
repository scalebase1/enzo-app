import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font } from '../ui.js'

const pad = (n) => String(n).padStart(2, '0')

// "2026-07-15T16:00" (datetime-local) -> ISO-streng med lokal offset, saa
// dato/tid bevares uanset hvordan backenden parser den.
function tilISO(lokal) {
  const d = new Date(lokal)
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// ISO -> vaerdi til <input type="datetime-local">.
function tilLokalInput(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const tilHeltal = (s) => {
  const n = parseInt(String(s).replace(/\D/g, ''), 10)
  return isNaN(n) ? null : n
}

// Dansk beloebs-format. Komma = decimal, punktum = tusind. Uden komma er
// "12.500"/"1.234.567" tusindgruppering, mens "4500.50"/"12.5" er punktum-decimal
// (1-2 cifre efter punktum kan ikke vaere en tusindgruppe). Tvetydigt -> null,
// saa gem() kan vise en fejl frem for tavst at gemme et 100x forkert beloeb.
const tilBeloeb = (s) => {
  let r = String(s).replace(/[^\d,.]/g, '')
  if (!r) return null
  if (r.includes(',')) r = r.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(r)) r = r.replace(/\./g, '')
  else if (/^\d+\.\d{1,2}$/.test(r)) { /* punktum er decimal — behold */ }
  else if (r.includes('.')) return null
  const n = Number(r)
  return isNaN(n) ? null : n
}

const feltLabel = { fontSize: 11, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 4 }

function Felt({ tekst, flex = 1, children }) {
  return (
    <div style={{ flex, minWidth: 0 }}>
      <div style={feltLabel}>{tekst}</div>
      {children}
    </div>
  )
}

// Modal-formular til booking-oprettelse/redigering via admin_booking_gem.
// Ved redigering hentes de raa felter via booking_hent (ikke laengere parsning
// af visningstekst — det skabte dublet-kunder). customer_id sendes med ved gem,
// saa backend aldrig gaetter paa kunden.
export default function BookingForm({ enheder, booking, onClose, onSaved }) {
  const erRedigering = !!booking

  const [navn, setNavn] = useState('')
  const [email, setEmail] = useState('')
  const [firma, setFirma] = useState('')
  const [telefon, setTelefon] = useState('')
  const [kundetype, setKundetype] = useState(erRedigering ? '' : 'privat')
  const [eventDato, setEventDato] = useState('')
  const [kuverter, setKuverter] = useState('')
  const [antalStaff, setAntalStaff] = useState('')
  const [pris, setPris] = useState('')
  const [mad, setMad] = useState('')
  const [enhedId, setEnhedId] = useState('')
  const [info, setInfo] = useState('')
  const [oprindeligInfo, setOprindeligInfo] = useState('')
  const [customerId, setCustomerId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')
  const [henter, setHenter] = useState(erRedigering)   // loading mens booking_hent koerer
  const [hentFejl, setHentFejl] = useState('')

  // Ved redigering: hent raa felter og forudfyld ALT fra svaret.
  useEffect(() => {
    if (!erRedigering) return
    let alive = true
    setHenter(true); setHentFejl('')
    supabase.rpc('booking_hent', { p_id: booking.booking_id }).then(({ data, error }) => {
      if (!alive) return
      setHenter(false)
      if (error) { setHentFejl('Kunne ikke hente bookingen: ' + error.message); return }
      if (!data || data.ok === false) { setHentFejl(data?.fejl || 'Kunne ikke hente bookingen.'); return }
      const b = data.booking || {}
      const k = b.kunde || {}
      setNavn(k.navn || '')
      setEmail(k.email || '')
      setFirma(k.firma || '')
      setTelefon(k.telefon || '')
      setKundetype(k.type || '')
      setEventDato(b.event_date ? tilLokalInput(b.event_date) : '')
      setKuverter(b.covers != null ? String(b.covers) : '')
      setAntalStaff(b.staff_required != null ? String(b.staff_required) : '')
      // Komma-decimal (dansk) saa enhver decimal-mangde round-tripper gennem tilBeloeb.
      setPris(b.total_price != null ? String(Number(b.total_price)).replace('.', ',') : '')
      setMad(b.food_type || '')
      setEnhedId(b.enhed_id || '')
      setInfo(b.info || '')
      setOprindeligInfo(b.info || '')
      setCustomerId(b.customer_id || null)
    })
    return () => { alive = false }
  }, [erRedigering, booking])

  const catering = enheder.filter((e) => e.type === 'catering')
  const vogne = enheder.filter((e) => e.type === 'madvogn')

  async function gem() {
    if (busy) return
    setFejl('')
    if (!eventDato) { setFejl('Vælg dato og tidspunkt.'); return }
    if (!erRedigering && !navn.trim()) { setFejl('Skriv kundens navn.'); return }
    if (!erRedigering && !email.trim()) { setFejl('Skriv kundens email — den bruges til at finde eller oprette kunden.'); return }
    if (pris.trim() && tilBeloeb(pris) === null) { setFejl('Ugyldigt beløb — skriv fx 12.500 eller 12.500,50'); return }
    // Backenden bevarer info hvis tom sendes → tømning kan ikke gennemføres; bloker
    // aerligt frem for tavst at kaste brugerens handling bort.
    if (erRedigering && oprindeligInfo.trim() && !info.trim()) { setFejl('Info-feltet kan ikke tømmes her — skriv mindst ét tegn, eller behold den nuværende tekst.'); return }

    const p = { event_date: tilISO(eventDato) }
    if (erRedigering) {
      p.booking_id = booking.booking_id
      // Udpeg kunden eksplicit → backend gaetter aldrig (ingen dublet-kunder).
      if (customerId) p.customer_id = customerId
    } else {
      // Ny booking: kunde-felterne opretter/finder kunden.
      if (navn.trim()) p.name = navn.trim()
      if (email.trim()) p.email = email.trim()
      if (firma.trim()) p.company = firma.trim()
      if (telefon.trim()) p.phone = telefon.trim()
      if (kundetype) p.type = kundetype
    }
    // Booking-felter (begge modes).
    if (mad) p.food_type = mad
    const kuv = tilHeltal(kuverter)
    if (kuv !== null) p.covers = kuv
    const staff = tilHeltal(antalStaff)
    if (staff !== null) p.staff_required = staff
    const total = tilBeloeb(pris)
    if (total !== null) p.total_price = total
    if (enhedId) p.enhed_id = enhedId
    if (info.trim()) p.info = info.trim()

    setBusy(true)
    const { data, error } = await supabase.rpc('admin_booking_gem', { p_data: p })
    setBusy(false)
    if (error) { setFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke gemme bookingen.'); return }
    onSaved(data)
  }

  const inputU = { ...input, marginBottom: 0 }
  const laasKunde = erRedigering // kundedata redigeres ikke her (backend roerer den ikke ved rediger)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60, fontFamily: font }}
    >
      <div style={{ ...card, width: 540, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: c.ink }}>{erRedigering ? 'Rediger booking' : 'Ny booking'}</div>
          <button onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, padding: 0 }}>×</button>
        </div>

        {henter ? (
          <div style={{ color: c.sub, fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Henter booking …</div>
        ) : hentFejl ? (
          <>
            <div style={{ fontSize: 14, color: c.red, fontWeight: 600 }}>{hentFejl}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={onClose}>Luk</button>
            </div>
          </>
        ) : (
          <>
            <Felt tekst="Enhed">
              <select style={inputU} value={enhedId} onChange={(e) => setEnhedId(e.target.value)}>
                <option value="">{enheder.length ? 'Vælg enhed …' : 'Ingen enheder fundet'}</option>
                {catering.length > 0 && (
                  <optgroup label="Catering">
                    {catering.map((e) => <option key={e.id} value={e.id}>{e.navn}</option>)}
                  </optgroup>
                )}
                {vogne.length > 0 && (
                  <optgroup label="Madvogne">
                    {vogne.map((e) => <option key={e.id} value={e.id}>{e.navn}</option>)}
                  </optgroup>
                )}
              </select>
            </Felt>

            <div style={{ display: 'flex', gap: 10 }}>
              <Felt tekst="Kundens navn">
                <input style={inputU} value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Navn" disabled={laasKunde} />
              </Felt>
              <Felt tekst="Email">
                <input style={inputU} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@email.dk" disabled={laasKunde} />
              </Felt>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Felt tekst="Firma (valgfri)">
                <input style={inputU} value={firma} onChange={(e) => setFirma(e.target.value)} placeholder="Firma" disabled={laasKunde} />
              </Felt>
              <Felt tekst="Telefon">
                <input style={inputU} type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon" disabled={laasKunde} />
              </Felt>
              <Felt tekst="Kundetype">
                <select style={inputU} value={kundetype} onChange={(e) => setKundetype(e.target.value)} disabled={laasKunde}>
                  <option value="">— vælg —</option>
                  <option value="privat">Privat</option>
                  <option value="virksomhed">Virksomhed</option>
                </select>
              </Felt>
            </div>

            {laasKunde && (
              <div style={{ fontSize: 12, color: c.sub, marginTop: -4 }}>Kundeoplysninger redigeres under Kunder — her ændres kun selve bookingen.</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Felt tekst="Dato & tid" flex={1.4}>
                <input style={inputU} type="datetime-local" value={eventDato} onChange={(e) => setEventDato(e.target.value)} />
              </Felt>
              <Felt tekst="Kuverter">
                <input style={inputU} type="number" min="0" inputMode="numeric" value={kuverter} onChange={(e) => setKuverter(e.target.value)} placeholder="Antal" />
              </Felt>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Felt tekst="Medarbejdere">
                <input style={inputU} type="number" min="0" inputMode="numeric" value={antalStaff} onChange={(e) => setAntalStaff(e.target.value)} placeholder="Antal" />
              </Felt>
              <Felt tekst="Pris (kr.)">
                <input style={inputU} inputMode="decimal" value={pris} onChange={(e) => setPris(e.target.value)} placeholder="fx 12.500" />
              </Felt>
              <Felt tekst="Mad (valgfri)">
                <select style={inputU} value={mad} onChange={(e) => setMad(e.target.value)}>
                  <option value="">— vælg —</option>
                  <option value="thai">Thai</option>
                  <option value="pizza">Pizza</option>
                  <option value="pasta">Pasta</option>
                </select>
              </Felt>
            </div>

            <Felt tekst="Info · logistik">
              <textarea
                rows={3}
                style={{ ...inputU, resize: 'vertical', fontFamily: font }}
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                placeholder='Fx "hentes på lageret kl. 10, leveres til Tivoli"'
              />
            </Felt>

            {fejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 600 }}>{fejl}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }} onClick={onClose} disabled={busy}>Annuller</button>
              <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={gem} disabled={busy}>
                {busy ? 'Gemmer …' : (erRedigering ? 'Gem ændringer' : 'Opret booking')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
