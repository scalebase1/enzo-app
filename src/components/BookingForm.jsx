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

// ISO fra kalender_data -> vaerdi til <input type="datetime-local">.
function tilLokalInput(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Best-effort forudfyldning ved redigering: kalender_data eksponerer kun
// kundefelterne via beskrivelses-linjerne ("Kunde: X"). Ukendte noegler
// ignoreres — felterne staar saa bare tomme (= uaendret ved gem).
function parseBeskrivelse(besk) {
  const ud = {}
  for (const l of (besk || '').split('\n')) {
    const sep = l.indexOf(':')
    if (sep <= 0) continue
    const key = l.slice(0, sep).trim().toLowerCase()
    const val = l.slice(sep + 1).trim()
    if (!val) continue
    if (key === 'kunde' || key === 'navn') ud.name = val
    else if (key === 'email' || key === 'e-mail' || key === 'mail') ud.email = val
    else if (key === 'firma' || key === 'virksomhed') ud.company = val
    else if (key === 'telefon' || key === 'tlf' || key === 'tlf.') ud.phone = val
    else if (key === 'kuverter' || key === 'covers') ud.covers = val.replace(/\D/g, '')
    else if (key === 'medarbejdere' || key === 'bemanding' || key === 'personale') ud.staff_required = val.replace(/\D/g, '')
    else if (key === 'pris' || key === 'total' || key === 'totalpris') ud.total_price = val.replace(/[^\d,.]/g, '')
    else if (key === 'mad' || key === 'koncept' || key === 'menu') {
      const m = val.toLowerCase()
      if (m.includes('thai')) ud.food_type = 'thai'
      else if (m.includes('pizza')) ud.food_type = 'pizza'
      else if (m.includes('pasta')) ud.food_type = 'pasta'
    } else if (key === 'type' || key === 'kundetype') {
      const m = val.toLowerCase()
      if (m.includes('privat')) ud.type = 'privat'
      else if (m.includes('virksomhed') || m.includes('firma') || m.includes('erhverv')) ud.type = 'virksomhed'
    }
  }
  return ud
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
// booking=null -> opret; booking=raa kalender_data-booking -> rediger (kun
// udfyldte felter sendes, saa tomme felter aldrig overskriver backend-data).
export default function BookingForm({ enheder, booking, onClose, onSaved }) {
  const erRedigering = !!booking
  const [forud] = useState(() => (erRedigering ? parseBeskrivelse(booking.beskrivelse) : {}))

  const [navn, setNavn] = useState(forud.name || '')
  const [email, setEmail] = useState(forud.email || '')
  const [firma, setFirma] = useState(forud.company || '')
  const [telefon, setTelefon] = useState(forud.phone || '')
  const [kundetype, setKundetype] = useState(forud.type || (erRedigering ? '' : 'privat'))
  const [eventDato, setEventDato] = useState(erRedigering ? tilLokalInput(booking.start) : '')
  const [kuverter, setKuverter] = useState(forud.covers || '')
  const [antalStaff, setAntalStaff] = useState(forud.staff_required || '')
  const [pris, setPris] = useState(forud.total_price || '')
  const [mad, setMad] = useState(forud.food_type || '')
  // enhedId forudfyldes fra enhedens NAVN (kalender_data eksponerer ikke id'et).
  // enheder-proppen kan ankomme efter mount, saa vi synker i en effekt frem for
  // en mount-only initializer. enhedRoert=true naar admin selv har valgt.
  const [enhedId, setEnhedId] = useState('')
  const [enhedRoert, setEnhedRoert] = useState(false)
  const [info, setInfo] = useState(erRedigering ? (booking.info || '') : '')
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')

  useEffect(() => {
    if (erRedigering && !enhedRoert) {
      setEnhedId(enheder.find((e) => e.navn === booking.enhed)?.id || '')
    }
  }, [enheder, erRedigering, enhedRoert, booking])

  const catering = enheder.filter((e) => e.type === 'catering')
  const vogne = enheder.filter((e) => e.type === 'madvogn')
  const uaendret = erRedigering ? '(uændret)' : null

  async function gem() {
    if (busy) return
    setFejl('')
    if (!eventDato) { setFejl('Vælg dato og tidspunkt.'); return }
    if (!erRedigering && !navn.trim()) { setFejl('Skriv kundens navn.'); return }
    if (!erRedigering && !email.trim()) { setFejl('Skriv kundens email — den bruges til at finde eller oprette kunden.'); return }
    if (pris.trim() && tilBeloeb(pris) === null) { setFejl('Ugyldigt beløb — skriv fx 12.500 eller 12.500,50'); return }

    const p = { event_date: tilISO(eventDato) }
    if (erRedigering) p.booking_id = booking.booking_id
    if (navn.trim()) p.name = navn.trim()
    if (email.trim()) p.email = email.trim()
    if (firma.trim()) p.company = firma.trim()
    if (telefon.trim()) p.phone = telefon.trim()
    if (kundetype) p.type = kundetype
    if (mad) p.food_type = mad
    const kuv = tilHeltal(kuverter)
    if (kuv !== null) p.covers = kuv
    const staff = tilHeltal(antalStaff)
    if (staff !== null) p.staff_required = staff
    const total = tilBeloeb(pris)
    if (total !== null) p.total_price = total
    // Ved redigering er enhedId inferreret fra navn — send det kun hvis admin
    // aktivt har valgt, saa en navne-kollision aldrig flytter bookingen tavst.
    if (enhedId && (!erRedigering || enhedRoert)) p.enhed_id = enhedId
    if (info.trim() || erRedigering) p.info = info.trim()

    setBusy(true)
    const { data, error } = await supabase.rpc('admin_booking_gem', { p_data: p })
    setBusy(false)
    if (error) { setFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke gemme bookingen.'); return }
    onSaved(data)
  }

  const inputU = { ...input, marginBottom: 0 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60, fontFamily: font }}
    >
      <div style={{ ...card, width: 540, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: c.ink }}>{erRedigering ? 'Rediger booking' : 'Ny booking'}</div>
          <button onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: 'pointer', padding: 0 }}>×</button>
        </div>

        <Felt tekst="Enhed">
          <select style={inputU} value={enhedId} onChange={(e) => { setEnhedRoert(true); setEnhedId(e.target.value) }}>
            <option value="">{uaendret || (enheder.length ? 'Vælg enhed …' : 'Ingen enheder fundet')}</option>
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
            <input style={inputU} value={navn} onChange={(e) => setNavn(e.target.value)} placeholder={uaendret || 'Navn'} />
          </Felt>
          <Felt tekst="Email">
            <input style={inputU} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={uaendret || 'kunde@email.dk'} />
          </Felt>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Felt tekst="Firma (valgfri)">
            <input style={inputU} value={firma} onChange={(e) => setFirma(e.target.value)} placeholder={uaendret || 'Firma'} />
          </Felt>
          <Felt tekst="Telefon">
            <input style={inputU} type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder={uaendret || 'Telefon'} />
          </Felt>
          <Felt tekst="Kundetype">
            <select style={inputU} value={kundetype} onChange={(e) => setKundetype(e.target.value)}>
              {uaendret && !forud.type && <option value="">{uaendret}</option>}
              <option value="privat">Privat</option>
              <option value="virksomhed">Virksomhed</option>
            </select>
          </Felt>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Felt tekst="Dato & tid" flex={1.4}>
            <input style={inputU} type="datetime-local" value={eventDato} onChange={(e) => setEventDato(e.target.value)} />
          </Felt>
          <Felt tekst="Kuverter">
            <input style={inputU} type="number" min="0" inputMode="numeric" value={kuverter} onChange={(e) => setKuverter(e.target.value)} placeholder={uaendret || 'Antal'} />
          </Felt>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Felt tekst="Medarbejdere">
            <input style={inputU} type="number" min="0" inputMode="numeric" value={antalStaff} onChange={(e) => setAntalStaff(e.target.value)} placeholder={uaendret || 'Antal'} />
          </Felt>
          <Felt tekst="Pris (kr.)">
            <input style={inputU} inputMode="decimal" value={pris} onChange={(e) => setPris(e.target.value)} placeholder={uaendret || 'fx 12.500'} />
          </Felt>
          <Felt tekst="Mad (valgfri)">
            <select style={inputU} value={mad} onChange={(e) => setMad(e.target.value)}>
              <option value="">{uaendret || '— vælg —'}</option>
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

        {erRedigering && <div style={{ fontSize: 12, color: c.sub }}>Tomme felter ændres ikke — udfyld kun det, der skal opdateres.</div>}
        {fejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 600 }}>{fejl}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }} onClick={onClose} disabled={busy}>Annuller</button>
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={gem} disabled={busy}>
            {busy ? 'Gemmer …' : (erRedigering ? 'Gem ændringer' : 'Opret booking')}
          </button>
        </div>
      </div>
    </div>
  )
}
