import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, SUPABASE_ANON } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, monoFont, sp } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'

export const PROXY = 'https://vakumjnnmfyqkcoxqcra.supabase.co/functions/v1/enzo-chat'

function StatusBadge({ status }) {
  return <StatusChip status={status} />
}

function fejlTekst(resultat) {
  if (resultat == null) return 'ukendt fejl'
  if (typeof resultat === 'string') return resultat
  return resultat.fejl || resultat.error || resultat.message || JSON.stringify(resultat)
}

function tidspunkt(ts) {
  try {
    return new Date(ts).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}

// Chat med Enzo via enzo-chat (edge-funktion → Supabase RPC'er). Historik er lokal
// state — Enzo har selv Postgres-memory paa backend-siden.
function EnzoChat({ onSvar, forslag = [], onAfgoer, busyId }) {
  const [beskeder, setBeskeder] = useState([])
  const [tekst, setTekst] = useState('')
  const [venter, setVenter] = useState(false)
  const [chatFejl, setChatFejl] = useState('')
  // Enzos hukommelse noegles paa sessionId. Vi persisterer det i localStorage pr.
  // bruger (enzo_session_<user.id>), saa historikken overlever reload — foer fik
  // hver sideindlaesning et nyt id, og serverens gemte historik blev aldrig laest
  // igen. "Ny samtale" laver stadig et FRISKT id (det er meningen at den nulstiller).
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [uid, setUid] = useState(null)
  const [historikFejl, setHistorikFejl] = useState('')
  const uidRef = useRef(null)
  const boxRef = useRef(null)

  // Adopter et gemt sessionId for den aktuelle bruger; ellers persistér det friske.
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      const u = data.session?.user?.id
      if (!u) return
      uidRef.current = u
      setUid(u)
      const key = `enzo_session_${u}`
      let gemt = null
      try { gemt = localStorage.getItem(key) } catch { /* ignore */ }
      if (gemt) setSessionId(gemt)
      else { try { localStorage.setItem(key, sessionId) } catch { /* ignore */ } }
    })
    return () => { alive = false }
  }, [])

  // Indlaes samtalens historik, saa chatten ikke starter tom ved hver
  // sideindlaesning — og saa et spoergsmaal stillet fra forsiden er synligt.
  // Noeglen i databasen er "<uid>:<sessionId>": edge-funktionen praefikser selv
  // med bruger-id'et, og enzo_historik afviser alt der ikke starter med ens eget.
  useEffect(() => {
    if (!uid) return
    let alive = true
    setHistorikFejl('')
    supabase.rpc('enzo_historik', { p_session_id: `${uid}:${sessionId}` }).then(({ data, error }) => {
      if (!alive) return
      if (error) { setHistorikFejl(error.message); return }
      if (!data || data.ok === false) { setHistorikFejl(data?.fejl || 'Kunne ikke hente historikken.'); return }
      setBeskeder((data.beskeder || []).map((b) => ({ rolle: b.afsender === 'bruger' ? 'bruger' : 'enzo', tekst: b.tekst })))
    })
    return () => { alive = false }
  }, [uid, sessionId])

  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [beskeder, venter])

  function nySamtale() {
    if (venter) return
    setBeskeder([])
    setTekst('')
    setChatFejl('')
    setHistorikFejl('')
    const nyt = crypto.randomUUID()
    if (uidRef.current) {
      try { localStorage.setItem(`enzo_session_${uidRef.current}`, nyt) } catch { /* ignore */ }
    }
    setSessionId(nyt)
  }

  async function send() {
    const t = tekst.trim()
    if (!t || venter) return
    setChatFejl(''); setTekst('')
    setBeskeder((b) => [...b, { rolle: 'bruger', tekst: t }])

    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    if (!tok) { setChatFejl('Session udløbet — genindlæs siden.'); return }

    setVenter(true)
    const ctrl = new AbortController()
    // 60s, ikke 30: et statusspoergsmaal tager ~31s maalt i produktion
    // (Enzo kalder hent_status og skriver derefter et fuldt overblik).
    // 30s afbroed svaret MENS det var paa vej — det var fejlen William saa.
    const timer = setTimeout(() => ctrl.abort(), 60000)
    try {
      const res = await fetch(PROXY, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatInput: t, sessionId }),
        signal: ctrl.signal })
      clearTimeout(timer)
      const raw = await res.text()
      let d = null
      try { d = JSON.parse(raw) } catch { /* ignore */ }
      setVenter(false)
      if (!res.ok || !d || d.ok === false || typeof d.svar !== 'string') {
        setChatFejl(d && d.fejl ? 'Enzo-fejl: ' + d.fejl : 'Fejlede (' + res.status + ') — prøv igen.')
        return
      }
      setBeskeder((b) => [...b, { rolle: 'enzo', tekst: d.svar }])
      onSvar?.()
    } catch (er) {
      clearTimeout(timer); setVenter(false)
      setChatFejl(er && er.name === 'AbortError' ? 'Enzo brugte for lang tid. Prøv at spørge om noget mere afgrænset.' : 'Uventet fejl — prøv igen.')
    }
  }

  const boble = (m, i) => (
    <div key={i} style={{ display: 'flex', justifyContent: m.rolle === 'bruger' ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '9px 13px',
          borderRadius: 14,
          fontSize: 14,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          ...(m.rolle === 'bruger'
            ? { background: c.blue, color: '#fff', borderBottomRightRadius: 4 }
            : { background: c.card, border: `1px solid ${c.line}`, color: c.text, borderBottomLeftRadius: 4 }) }}
      >
        {m.tekst}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: c.sub }}>
          Chat med Enzo
        </div>
        <button
          onClick={nySamtale}
          disabled={venter}
          style={{ ...btnGhost, padding: '5px 11px', fontSize: 12.5, opacity: venter ? 0.6 : 1 }}
        >
          + Ny samtale
        </button>
      </div>
      <div style={{ ...card, padding: 0, display: 'flex', flexDirection: 'column', height: 480 }}>
        <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: c.bg, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {beskeder.length === 0 && !venter && (
            <div style={{ color: c.slate2, fontSize: 13, textAlign: 'center', margin: 'auto 0' }}>
              Skriv til Enzo — fx "Hvad sker der i denne uge?"
            </div>
          )}
          {beskeder.map(boble)}
          {venter && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '9px 13px', borderRadius: 14, fontSize: 13, color: c.sub, background: c.card, border: `1px solid ${c.line}`, borderBottomLeftRadius: 4 }}>
                Enzo tænker …
              </div>
            </div>
          )}

          {/* Afventende forslag vises som KNAPPER i selve chatten — William
              godkender eller afviser dem, hvor han er, uden at lede efter dem
              i sidepanelet. */}
          {onAfgoer && forslag.map((f) => (
            <div key={f.id} style={{ alignSelf: 'stretch', background: c.card, border: `1px solid ${c.line}`, borderLeft: `4px solid ${c.accent}`, borderRadius: 12, padding: '10px 13px' }}>
              <div style={{ fontSize: 11, color: c.slate2, marginBottom: 4 }}>Forslag fra Enzo</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: c.ink }}>{f.menneske_tekst}</div>
              {f.begrundelse && <div style={{ fontSize: 12.5, color: c.sub, marginTop: 4 }}>{f.begrundelse}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  style={{ ...btn, background: c.green, padding: '8px 14px', minHeight: 40, opacity: busyId ? 0.6 : 1, cursor: busyId ? 'default' : 'pointer' }}
                  disabled={!!busyId}
                  onClick={() => onAfgoer(f, 'godkendt')}
                >
                  {busyId === f.id ? 'Arbejder …' : 'Godkend'}
                </button>
                <button
                  style={{ ...btnGhost, padding: '8px 14px', minHeight: 40, opacity: busyId ? 0.6 : 1, cursor: busyId ? 'default' : 'pointer' }}
                  disabled={!!busyId}
                  onClick={() => onAfgoer(f, 'afvist')}
                >
                  Afvis
                </button>
              </div>
            </div>
          ))}
        </div>
        {historikFejl && (
          <div style={{ padding: '8px 16px', color: c.red, fontSize: 13, borderTop: `1px solid ${c.line}`, whiteSpace: 'pre-wrap' }}>{historikFejl}</div>
        )}
        {chatFejl && (
          <div style={{ padding: '8px 16px', color: c.red, fontSize: 13, borderTop: `1px solid ${c.line}` }}>{chatFejl}</div>
        )}
        <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${c.line}` }}>
          <input
            style={{ ...input, marginBottom: 0, flex: 1 }}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Skriv en besked til Enzo …"
            disabled={venter}
          />
          <button style={{ ...btn, opacity: venter || !tekst.trim() ? 0.6 : 1 }} onClick={send} disabled={venter || !tekst.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Enzo() {
  const [forslag, setForslag] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  // Kvittering for seneste beslutning: { kind: 'ok'|'fejl'|'neutral', tekst }
  const [kvittering, setKvittering] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('enzo_forslag_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente forslag.'); return }
    setForslag(data.forslag || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function afgoer(f, beslutning) {
    setBusyId(f.id); setKvittering(null)
    const { data, error } = await supabase.rpc('enzo_forslag_afgoer', { p_id: f.id, p_beslutning: beslutning })
    setBusyId(null)
    if (error) {
      setKvittering({ kind: 'fejl', tekst: 'RPC-fejl: ' + error.message })
    } else if (!data || data.ok === false) {
      setKvittering({ kind: 'fejl', tekst: 'Fejlede: ' + fejlTekst(data?.resultat) })
    } else if (data.status === 'udfoert') {
      setKvittering({ kind: 'ok', tekst: 'Godkendt og udført ✓ — ' + f.menneske_tekst })
    } else if (data.status === 'fejlet') {
      setKvittering({ kind: 'fejl', tekst: 'Godkendt, men eksekveringen FEJLEDE — handlingen er IKKE gennemført: ' + fejlTekst(data.resultat) })
    } else if (data.status === 'afvist') {
      setKvittering({ kind: 'neutral', tekst: 'Afvist — ' + f.menneske_tekst })
    } else {
      setKvittering({ kind: 'neutral', tekst: 'Svar: ' + (data.status || 'ukendt status') })
    }
    load()
  }

  const ventende = (forslag || []).filter((f) => f.status === 'afventer')
    .sort((a, b) => new Date(a.oprettet) - new Date(b.oprettet))
  const besluttede = (forslag || []).filter((f) => f.status !== 'afventer')
    .sort((a, b) => new Date(b.oprettet) - new Date(a.oprettet))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Enzo</h1>
        {ventende.length > 0 && (
          <span style={{ background: '#F6EEDD', color: '#8A5F14', fontSize: 13, fontWeight: 500, padding: '4px 11px', borderRadius: 20 }}>
            {ventende.length} afventer
          </span>
        )}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Chat med Enzo og godkend eller afvis hans forslag. Godkendte handlinger eksekveres med det samme.
      </p>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          {kvittering && (
            <div
              style={{
                ...card,
                marginTop: 16,
                fontWeight: 500,
                fontSize: 14,
                ...(kvittering.kind === 'ok' && { background: '#E7EFE7', border: '1px solid #BFD3C1', color: '#3B6349' }),
                ...(kvittering.kind === 'fejl' && { background: '#F6E7E4', border: '1.5px solid #E0B6AF', color: '#8C3E36' }),
                ...(kvittering.kind === 'neutral' && { color: c.slate2 }) }}
            >
              {kvittering.tekst}
            </div>
          )}

          {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter forslag …</div>}
          {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

          {!loading && !err && forslag && (
            <>
              {ventende.length === 0 && (
                <div style={{ ...card, marginTop: 16, color: c.sub }}>Ingen forslag afventer godkendelse.</div>
              )}

              {ventende.map((f) => (
                <div key={f.id} style={{ ...card, marginTop: 16, borderLeft: `4px solid ${c.blue}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontFamily: monoFont, fontSize: 11, color: c.slate2, background: '#F2F1ED', padding: '2px 8px', borderRadius: 6 }}>{f.aktion}</span>
                    <span style={{ fontSize: 12, color: c.sub }}>{tidspunkt(f.oprettet)}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{f.menneske_tekst}</div>
                  {f.begrundelse && (
                    <div style={{ fontSize: 13, color: c.sub, marginTop: 6 }}>{f.begrundelse}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      style={{ ...btn, background: c.green, opacity: busyId ? 0.6 : 1 }}
                      disabled={!!busyId}
                      onClick={() => afgoer(f, 'godkendt')}
                    >
                      {busyId === f.id ? 'Arbejder …' : 'Godkend'}
                    </button>
                    <button
                      style={{ ...btnGhost, opacity: busyId ? 0.6 : 1 }}
                      disabled={!!busyId}
                      onClick={() => afgoer(f, 'afvist')}
                    >
                      Afvis
                    </button>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 12, color: c.sub, marginBottom: 8 }}>
                  Besluttet (sidste 7 dage)
                </div>
                {besluttede.length === 0 && (
                  <div style={{ padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: 12, color: c.sub, fontSize: 15, background: c.card }}>
                    Ingen beslutninger endnu.
                  </div>
                )}
                {besluttede.length > 0 && (
                  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    {besluttede.map((f, i) => (
                      <div key={f.id} style={{ padding: '12px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', display: 'flex', alignItems: 'center', gap: sp(3) }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{f.menneske_tekst}</div>
                          <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{tidspunkt(f.oprettet)}</div>
                          {f.status === 'fejlet' && (
                            <div style={{ fontSize: 12, color: c.red, marginTop: 4 }}>Fejl: {fejlTekst(f.resultat)}</div>
                          )}
                        </div>
                        <StatusBadge status={f.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 320, maxWidth: 560, marginTop: 16 }}>
          <EnzoChat onSvar={load} forslag={ventende} onAfgoer={afgoer} busyId={busyId} />
        </div>
      </div>
    </div>
  )
}
