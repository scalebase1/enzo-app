import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font, sp, tone } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'

// Konceptet hoerer til en fysisk madvogn/enhed — vises diskret.
function EnhedBadge({ navn }) {
  return <StatusChip tekst={navn} farve={tone.neutral} />
}

function InaktivBadge() {
  return <StatusChip tekst="Deaktiveret" farve={tone.neutral} />
}

// Sortering styrer raekkefoelgen kunderne ser i bookingformularen.
// Vi renummererer sekventielt (10, 20, 30 …) og sender KUN de raekker der
// faktisk skifter vaerdi — i praksis 2 ved et enkelt ombyt.
const RENUM = (i) => (i + 1) * 10

// ---------------- Menu pr. koncept ----------------
// Retterne her vises live paa casa-food.dk via menu-indtag. Raekkefoelgen
// William saetter er den raekkefoelge kunderne ser.
function MenuDialog({ koncept, onLuk }) {
  const [retter, setRetter] = useState(null)
  const [hentFejl, setHentFejl] = useState('')
  const [fejl, setFejl] = useState('')
  const [busy, setBusy] = useState(null)     // 'opret' | ret-id

  const [nyNavn, setNyNavn] = useState('')
  const [nyBesk, setNyBesk] = useState('')
  const [redigerId, setRedigerId] = useState(null)
  const [redNavn, setRedNavn] = useState('')
  const [redBesk, setRedBesk] = useState('')
  const [bekraeftSlet, setBekraeftSlet] = useState(null)

  const load = useCallback(async () => {
    setHentFejl('')
    const { data, error } = await supabase.rpc('menu_liste')
    if (error) { setHentFejl(error.message); return }
    if (!data || data.ok === false) { setHentFejl(data?.fejl || 'Kunne ikke hente menuen.'); return }
    const k = (data.koncepter || []).find((x) => x.madkoncept_id === koncept.id)
    setRetter(k ? (k.retter || []) : [])
  }, [koncept.id])

  useEffect(() => { load() }, [load])

  function tjek(data, error, fallback) {
    if (error) return error.message
    if (!data || data.ok === false) return data?.fejl || fallback
    return null
  }

  async function opret() {
    const navn = nyNavn.trim()
    if (!navn || busy) return
    setBusy('opret'); setFejl('')
    const { data, error } = await supabase.rpc('menu_ret_opret', {
      p_madkoncept_id: koncept.id, p_navn: navn, p_beskrivelse: nyBesk.trim() || null,
    })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke tilføje retten.')
    if (f) { setFejl(f); return }
    setNyNavn(''); setNyBesk('')
    load()
  }

  async function gem(r) {
    if (busy) return
    const navn = redNavn.trim()
    if (!navn) { setFejl('Retten skal have et navn.'); return }
    setBusy(r.id); setFejl('')
    // Beskrivelse sendes altid (ogsaa tom) saa William kan rydde den bevidst.
    const { data, error } = await supabase.rpc('menu_ret_opdater', {
      p_id: r.id, p_navn: navn, p_beskrivelse: redBesk.trim(),
    })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke gemme retten.')
    if (f) { setFejl(f); return }
    setRedigerId(null)
    load()
  }

  async function slet(r) {
    if (busy) return
    setBusy(r.id); setFejl('')
    const { data, error } = await supabase.rpc('menu_ret_slet', { p_id: r.id })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke fjerne retten.')
    if (f) { setFejl(f); return }
    setBekraeftSlet(null)
    load()
  }

  async function flyt(r, retning) {
    if (busy) return
    setBusy(r.id); setFejl('')
    const { data, error } = await supabase.rpc('menu_ret_flyt', { p_id: r.id, p_retning: retning })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke flytte retten.')
    if (f) { setFejl(f); return }
    load()
  }

  const antal = retter ? retter.length : 0

  return (
    <div
      onClick={onLuk}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...card, width: 620, maxWidth: '100%', marginTop: 40, padding: 0, overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: c.ink }}>Menu — {koncept.navn}</div>
            <div style={{ fontSize: 12.5, color: c.sub, marginTop: 3 }}>
              Retterne vises på hjemmesiden i den rækkefølge de står her.
              {!koncept.aktiv && ' Konceptet er deaktiveret, så menuen vises ikke lige nu.'}
            </div>
          </div>
          <button onClick={onLuk} style={{ ...btnGhost, padding: '6px 10px', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.line}` }}>
          <input
            style={{ ...input, marginBottom: 8 }}
            value={nyNavn}
            onChange={(e) => setNyNavn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') opret() }}
            placeholder="Rettens navn, fx “Margherita”"
          />
          <input
            style={{ ...input, marginBottom: 8 }}
            value={nyBesk}
            onChange={(e) => setNyBesk(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') opret() }}
            placeholder="Beskrivelse (valgfri), fx “San Marzano, fior di latte, basilikum”"
          />
          <button
            style={{ ...btn, opacity: (busy || !nyNavn.trim()) ? 0.6 : 1, cursor: (busy || !nyNavn.trim()) ? 'default' : 'pointer' }}
            disabled={!!busy || !nyNavn.trim()}
            onClick={opret}
          >
            {busy === 'opret' ? 'Tilføjer …' : 'Tilføj ret'}
          </button>
        </div>

        {fejl && (
          <div style={{ margin: '12px 18px 0', padding: '10px 14px', borderRadius: 10, background: tone.fejl.bg, border: `1px solid ${tone.fejl.col}33`, color: tone.fejl.col, fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {fejl}
          </div>
        )}
        {hentFejl && (
          <div style={{ margin: '12px 18px', color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>{hentFejl}</div>
        )}

        {retter === null && !hentFejl && <div style={{ padding: '16px 18px', color: c.sub }}>Henter menuen …</div>}

        {retter && antal === 0 && (
          <div style={{ padding: '16px 18px' }}>
            <div style={{ padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: 12, color: c.sub, fontSize: 15 }}>
              Ingen retter endnu. Tilføj den første ovenfor — så dukker menuen op på hjemmesiden.
            </div>
          </div>
        )}

        {retter && antal > 0 && (
          <div>
            {retter.map((r, i) => {
              const rowBusy = busy === r.id
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 18px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                    <button
                      onClick={() => flyt(r, 'op')}
                      disabled={!!busy || i === 0}
                      title="Flyt op"
                      style={{ border: `1px solid ${c.line}`, background: '#fff', borderRadius: 5, width: 24, height: 18, lineHeight: 1, fontSize: 11, color: c.slate2, cursor: (busy || i === 0) ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1, padding: 0 }}
                    >▲</button>
                    <button
                      onClick={() => flyt(r, 'ned')}
                      disabled={!!busy || i === antal - 1}
                      title="Flyt ned"
                      style={{ border: `1px solid ${c.line}`, background: '#fff', borderRadius: 5, width: 24, height: 18, lineHeight: 1, fontSize: 11, color: c.slate2, cursor: (busy || i === antal - 1) ? 'default' : 'pointer', opacity: i === antal - 1 ? 0.35 : 1, padding: 0 }}
                    >▼</button>
                  </div>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    {redigerId === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input style={{ ...input, marginBottom: 0 }} value={redNavn} onChange={(e) => setRedNavn(e.target.value)} autoFocus />
                        <input style={{ ...input, marginBottom: 0 }} value={redBesk} onChange={(e) => setRedBesk(e.target.value)} placeholder="Beskrivelse (valgfri)" />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={{ ...btn, padding: '8px 12px', opacity: rowBusy ? 0.6 : 1 }} disabled={rowBusy} onClick={() => gem(r)}>
                            {rowBusy ? 'Gemmer …' : 'Gem'}
                          </button>
                          <button style={{ ...btnGhost, padding: '8px 12px' }} disabled={rowBusy} onClick={() => { setRedigerId(null); setFejl('') }}>Annuller</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 500, color: c.ink }}>{r.navn}</div>
                        {r.beskrivelse && <div style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>{r.beskrivelse}</div>}
                      </>
                    )}
                  </div>

                  {redigerId !== r.id && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        style={{ ...btnGhost, padding: '7px 11px', fontSize: 13, opacity: busy ? 0.6 : 1 }}
                        disabled={!!busy}
                        onClick={() => { setRedigerId(r.id); setRedNavn(r.navn); setRedBesk(r.beskrivelse || ''); setFejl('') }}
                      >Ret</button>
                      {bekraeftSlet === r.id ? (
                        <>
                          <button style={{ ...btn, background: c.red, padding: '7px 11px', fontSize: 13, opacity: rowBusy ? 0.6 : 1 }} disabled={rowBusy} onClick={() => slet(r)}>
                            {rowBusy ? 'Fjerner …' : 'Ja, fjern'}
                          </button>
                          <button style={{ ...btnGhost, padding: '7px 11px', fontSize: 13 }} disabled={rowBusy} onClick={() => setBekraeftSlet(null)}>Fortryd</button>
                        </>
                      ) : (
                        <button
                          style={{ ...btnGhost, padding: '7px 11px', fontSize: 13, color: c.red, opacity: busy ? 0.6 : 1 }}
                          disabled={!!busy}
                          onClick={() => { setBekraeftSlet(r.id); setFejl('') }}
                        >Fjern</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Madkoncepter() {
  const [koncepter, setKoncepter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hentFejl, setHentFejl] = useState('')

  const [nytNavn, setNytNavn] = useState('')
  const [redigerId, setRedigerId] = useState(null)
  const [redigerNavn, setRedigerNavn] = useState('')
  const [bekraeftSlet, setBekraeftSlet] = useState(null)

  const [busy, setBusy] = useState(null)      // 'opret' | koncept-id
  const [fejl, setFejl] = useState('')        // backendens tekst, ORDRET
  const [kvittering, setKvittering] = useState('')
  const [menuFor, setMenuFor] = useState(null) // koncept hvis menu redigeres

  // Genindlaesning maa ikke skjule listen (loading gater kun foerste hentning),
  // ellers forsvinder og genopstaar raekkerne ved hver flytning.
  const load = useCallback(async ({ foerste = false } = {}) => {
    if (foerste) setLoading(true)
    setHentFejl('')
    const { data, error } = await supabase.rpc('madkoncept_liste')
    setLoading(false)
    if (error) { setHentFejl(error.message); return }
    if (!data || data.ok === false) { setHentFejl(data?.fejl || 'Kunne ikke hente madkoncepter.'); return }
    setKoncepter(data.koncepter || [])   // RPC'en sorterer allerede (sortering, navn)
  }, [])

  useEffect(() => { load({ foerste: true }) }, [load])

  // Faelles svar-tjek: fejl kan komme som `error` ELLER som data.ok === false.
  function tjek(data, error, fallback) {
    if (error) return error.message
    if (!data || data.ok === false) return data?.fejl || fallback
    return null
  }

  async function opret() {
    const navn = nytNavn.trim()
    if (!navn || busy) return
    setBusy('opret'); setFejl(''); setKvittering('')
    const { data, error } = await supabase.rpc('madkoncept_opret', { p_navn: navn })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke oprette konceptet.')
    if (f) { setFejl(f); return }
    setNytNavn('')
    setKvittering(`“${data.navn}” oprettet.`)
    load()
  }

  async function gemNavn(k) {
    const navn = redigerNavn.trim()
    if (!navn) { setFejl('Navn mangler.'); return }
    if (navn === k.navn) { setRedigerId(null); return }
    setBusy(k.id); setFejl(''); setKvittering('')
    // Send KUN navnet — aktiv/sortering er uaendrede (backend bruger coalesce).
    const { data, error } = await supabase.rpc('madkoncept_opdater', { p_id: k.id, p_navn: navn })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke omdøbe konceptet.')
    if (f) { setFejl(f); return }
    setRedigerId(null)
    setKvittering(`Omdøbt til “${data.navn}”.`)
    load()
  }

  async function skiftAktiv(k) {
    if (busy) return
    setBusy(k.id); setFejl(''); setKvittering('')
    const { data, error } = await supabase.rpc('madkoncept_opdater', { p_id: k.id, p_aktiv: !k.aktiv })
    setBusy(null)
    const f = tjek(data, error, 'Kunne ikke ændre status.')
    if (f) { setFejl(f); return }
    setKvittering(data.aktiv ? `“${data.navn}” er aktivt igen.` : `“${data.navn}” er deaktiveret — kan ikke vælges til nye bookinger.`)
    load()
  }

  async function flyt(index, retning) {
    if (busy || !koncepter) return
    const j = index + retning
    if (j < 0 || j >= koncepter.length) return

    const ny = koncepter.slice()
    const tmp = ny[index]; ny[index] = ny[j]; ny[j] = tmp

    // Renummerér, og skriv de nye vaerdier IND i den lokale state.
    // Uden det beholdt raekkerne deres gamle 'sortering' efter en optimistisk
    // flytning: naeste klik beregnede saa sin diff mod foraeldede tal, fandt
    // "ingen aendring", sendte intet — og listen hoppede tilbage ved reload,
    // som om den forkerte raekke var flyttet.
    const opdateret = ny.map((k, i) => ({ ...k, sortering: RENUM(i) }))
    const aendringer = opdateret.filter((k, i) => k.sortering !== ny[i].sortering)
    if (aendringer.length === 0) return

    setBusy(tmp.id); setFejl(''); setKvittering('')
    setKoncepter(opdateret)   // optimistisk OG konsistent
    for (const k of aendringer) {
      const { data, error } = await supabase.rpc('madkoncept_opdater', { p_id: k.id, p_sortering: k.sortering })
      const f = tjek(data, error, 'Kunne ikke ændre rækkefølgen.')
      if (f) { setBusy(null); setFejl(f); load(); return }
    }
    setBusy(null)
    load()
  }

  async function slet(k) {
    setBusy(k.id); setFejl(''); setKvittering('')
    const { data, error } = await supabase.rpc('madkoncept_slet', { p_id: k.id })
    setBusy(null); setBekraeftSlet(null)
    // Backendens fejl forklarer PRAECIS hvorfor (fx at konceptet er i brug) — vis den ordret.
    const f = tjek(data, error, 'Kunne ikke slette konceptet.')
    if (f) { setFejl(f); return }
    setKvittering(`“${k.navn}” slettet.`)
    load()
  }

  const inputU = { ...input, marginBottom: 0 }
  const antal = koncepter?.length ?? 0

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 500 }}>Madkoncepter</h1>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Dine madkoncepter. Rækkefølgen her styrer, hvad kunderne ser i bookingformularen.
        Deaktiverede koncepter kan ikke vælges til nye bookinger, men historikken bevares.
      </p>

      {/* Nyt koncept */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13, color: c.sub, fontWeight: 500, marginBottom: 10 }}>Nyt koncept</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...inputU, flex: 1, minWidth: 180 }}
            value={nytNavn}
            onChange={(e) => setNytNavn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') opret() }}
            placeholder="Navn, fx “Tapas”"
          />
          <button
            style={{ ...btn, opacity: (busy || !nytNavn.trim()) ? 0.6 : 1, cursor: (busy || !nytNavn.trim()) ? 'default' : 'pointer' }}
            disabled={!!busy || !nytNavn.trim()}
            onClick={opret}
          >
            {busy === 'opret' ? 'Tilføjer …' : 'Tilføj'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: c.sub, marginTop: 8 }}>Kun navnet — resten sættes automatisk.</div>
      </div>

      {fejl && (
        <div style={{ ...card, marginTop: 12, padding: '10px 14px', background: tone.fejl.bg, border: `1px solid ${tone.fejl.col}33`, color: tone.fejl.col, fontSize: 14, whiteSpace: 'pre-wrap' }}>
          {fejl}
        </div>
      )}
      {kvittering && !fejl && (
        <div style={{ ...card, marginTop: 12, padding: '10px 14px', background: tone.ok.bg, border: `1px solid ${tone.ok.col}33`, color: tone.ok.col, fontSize: 14 }}>
          {kvittering}
        </div>
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter madkoncepter …</div>}
      {hentFejl && <div style={{ ...card, marginTop: 16, color: c.red, whiteSpace: 'pre-wrap' }}>{hentFejl}</div>}

      {!loading && !hentFejl && koncepter && (
        antal === 0 ? (
          <div style={{ ...card, marginTop: 16, color: c.sub }}>Ingen madkoncepter endnu. Tilføj det første ovenfor.</div>
        ) : (
          <div style={{ ...card, marginTop: 16, padding: 0, overflow: 'hidden' }}>
            {koncepter.map((k, i) => {
              const rowBusy = busy === k.id
              const kanSlettes = (k.antal_bookinger || 0) === 0
              return (
                <div
                  key={k.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexWrap: 'wrap',
                    borderTop: i > 0 ? `1px solid ${c.line}` : 'none',
                    opacity: k.aktiv ? 1 : 0.55,
                  }}
                >
                  {/* Sortering */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      onClick={() => flyt(i, -1)}
                      disabled={!!busy || i === 0}
                      title="Flyt op"
                      style={{ border: `1px solid ${c.line}`, background: '#fff', borderRadius: 5, width: 24, height: 18, lineHeight: 1, fontSize: 11, color: c.slate2, cursor: (busy || i === 0) ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1, padding: 0 }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => flyt(i, 1)}
                      disabled={!!busy || i === antal - 1}
                      title="Flyt ned"
                      style={{ border: `1px solid ${c.line}`, background: '#fff', borderRadius: 5, width: 24, height: 18, lineHeight: 1, fontSize: 11, color: c.slate2, cursor: (busy || i === antal - 1) ? 'default' : 'pointer', opacity: i === antal - 1 ? 0.35 : 1, padding: 0 }}
                    >
                      ▼
                    </button>
                  </div>

                  {/* Navn (inline omdoeb) */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    {redigerId === k.id ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          style={{ ...inputU, flex: 1, minWidth: 140 }}
                          value={redigerNavn}
                          onChange={(e) => setRedigerNavn(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') gemNavn(k) }}
                          autoFocus
                        />
                        <button style={{ ...btn, padding: '8px 12px', opacity: rowBusy ? 0.6 : 1 }} disabled={rowBusy} onClick={() => gemNavn(k)}>
                          {rowBusy ? 'Gemmer …' : 'Gem'}
                        </button>
                        <button style={{ ...btnGhost, padding: '8px 12px' }} disabled={rowBusy} onClick={() => { setRedigerId(null); setFejl('') }}>
                          Annuller
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: c.ink }}>{k.navn}</span>
                        {k.enhed && <EnhedBadge navn={k.enhed} />}
                        {!k.aktiv && <InaktivBadge />}
                        <span style={{ fontSize: 12.5, color: c.sub }}>
                          {k.antal_bookinger || 0} booking{(k.antal_bookinger || 0) === 1 ? '' : 'er'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Handlinger */}
                  {redigerId !== k.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* Menuen er det William retter oftest — den staar foerst. */}
                      <button
                        style={{ ...btnGhost, padding: '7px 11px', fontSize: 13, opacity: busy ? 0.6 : 1 }}
                        disabled={!!busy}
                        onClick={() => { setMenuFor(k); setFejl('') }}
                        title="Retter der vises på hjemmesiden"
                      >
                        Menu{(k.antal_retter || 0) > 0 ? ` (${k.antal_retter})` : ''}
                      </button>

                      <button
                        style={{ ...btnGhost, padding: '7px 11px', fontSize: 13, opacity: busy ? 0.6 : 1 }}
                        disabled={!!busy}
                        onClick={() => { setRedigerId(k.id); setRedigerNavn(k.navn); setFejl('') }}
                      >
                        Omdøb
                      </button>

                      <button
                        style={{ ...btnGhost, padding: '7px 11px', fontSize: 13, opacity: busy ? 0.6 : 1 }}
                        disabled={!!busy}
                        onClick={() => skiftAktiv(k)}
                        title={k.aktiv ? 'Kan ikke vælges til nye bookinger' : 'Gør valgbar igen'}
                      >
                        {rowBusy ? '…' : (k.aktiv ? 'Deaktivér' : 'Aktivér')}
                      </button>

                      {/* Slet kun naar konceptet ikke er i brug. Ellers er deaktivér vejen. */}
                      {kanSlettes && (
                        bekraeftSlet === k.id ? (
                          <>
                            <span style={{ fontSize: 12.5, color: c.red }}>Slet “{k.navn}”?</span>
                            <button style={{ ...btn, background: c.red, padding: '7px 11px', fontSize: 13, opacity: rowBusy ? 0.6 : 1 }} disabled={rowBusy} onClick={() => slet(k)}>
                              {rowBusy ? 'Sletter …' : 'Ja, slet'}
                            </button>
                            <button style={{ ...btnGhost, padding: '7px 11px', fontSize: 13 }} disabled={rowBusy} onClick={() => setBekraeftSlet(null)}>
                              Fortryd
                            </button>
                          </>
                        ) : (
                          <button
                            style={{ ...btnGhost, padding: '7px 11px', fontSize: 13, color: c.red, opacity: busy ? 0.6 : 1 }}
                            disabled={!!busy}
                            onClick={() => { setBekraeftSlet(k.id); setFejl('') }}
                          >
                            Slet
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {!loading && !hentFejl && antal > 0 && (
        <div style={{ fontSize: 12.5, color: c.sub, marginTop: 10 }}>
          Koncepter der bruges af bookinger kan ikke slettes — deaktivér dem i stedet, så bevares historikken.
          Menuerne under “Menu” vises live på hjemmesiden.
        </div>
      )}

      {menuFor && (
        <MenuDialog
          koncept={menuFor}
          onLuk={() => { setMenuFor(null); load() }}
        />
      )}
    </div>
  )
}
