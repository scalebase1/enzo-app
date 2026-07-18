import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font, sp } from '../ui.js'

// Konceptet hoerer til en fysisk madvogn/enhed — vises diskret.
function EnhedBadge({ navn }) {
  return (
    <span style={{ background: '#F1F5F9', color: c.slate2, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {navn}
    </span>
  )
}

function InaktivBadge() {
  return (
    <span style={{ background: '#E5E7EB', color: '#4B5563', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      Deaktiveret
    </span>
  )
}

// Sortering styrer raekkefoelgen kunderne ser i bookingformularen.
// Vi renummererer sekventielt (10, 20, 30 …) og sender KUN de raekker der
// faktisk skifter vaerdi — i praksis 2 ved et enkelt ombyt.
const RENUM = (i) => (i + 1) * 10

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

  const load = useCallback(async () => {
    setLoading(true); setHentFejl('')
    const { data, error } = await supabase.rpc('madkoncept_liste')
    setLoading(false)
    if (error) { setHentFejl(error.message); return }
    if (!data || data.ok === false) { setHentFejl(data?.fejl || 'Kunne ikke hente madkoncepter.'); return }
    setKoncepter(data.koncepter || [])   // RPC'en sorterer allerede (sortering, navn)
  }, [])

  useEffect(() => { load() }, [load])

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

    // Kun de raekker hvis sortering faktisk aendrer sig.
    const aendringer = ny
      .map((k, i) => ({ k, nySort: RENUM(i) }))
      .filter(({ k, nySort }) => k.sortering !== nySort)
    if (aendringer.length === 0) return

    setBusy(tmp.id); setFejl(''); setKvittering('')
    setKoncepter(ny)   // optimistisk, saa raekken flytter sig med det samme
    for (const { k, nySort } of aendringer) {
      const { data, error } = await supabase.rpc('madkoncept_opdater', { p_id: k.id, p_sortering: nySort })
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
      <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Madkoncepter</h1>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Dine madkoncepter. Rækkefølgen her styrer, hvad kunderne ser i bookingformularen.
        Deaktiverede koncepter kan ikke vælges til nye bookinger, men historikken bevares.
      </p>

      {/* Nyt koncept */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Nyt koncept</div>
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
        <div style={{ ...card, marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: c.red, fontSize: 14, whiteSpace: 'pre-wrap' }}>
          {fejl}
        </div>
      )}
      {kvittering && !fejl && (
        <div style={{ ...card, marginTop: 12, padding: '10px 14px', background: '#F0FDF4', border: '1px solid #86EFAC', color: c.green, fontSize: 14 }}>
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
                        <span style={{ fontSize: 15, fontWeight: 700, color: c.ink }}>{k.navn}</span>
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
        </div>
      )}
    </div>
  )
}
