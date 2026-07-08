import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, monoFont, sp } from '../ui.js'

function StatusBadge({ status }) {
  let bg = '#E5E7EB', col = '#4B5563', txt = status || '—'
  if (status === 'udfoert') { bg = '#DCFCE7'; col = '#166534'; txt = 'udført' }
  else if (status === 'fejlet') { bg = '#FEE2E2'; col = '#991B1B'; txt = 'fejlet' }
  else if (status === 'afvist') { bg = '#E5E7EB'; col = '#4B5563'; txt = 'afvist' }
  else if (status === 'afventer') { bg = '#FEF3C7'; col = '#92400E'; txt = 'afventer' }
  return <span style={{ background: bg, color: col, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{txt}</span>
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
          <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 700, padding: '4px 11px', borderRadius: 20 }}>
            {ventende.length} afventer
          </span>
        )}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Enzos forslag — godkend eller afvis. Godkendte handlinger eksekveres med det samme.
      </p>

      {kvittering && (
        <div
          style={{
            ...card,
            marginTop: 16,
            fontWeight: 600,
            fontSize: 14,
            ...(kvittering.kind === 'ok' && { background: '#DCFCE7', border: '1px solid #86EFAC', color: '#166534' }),
            ...(kvittering.kind === 'fejl' && { background: '#FEE2E2', border: '1.5px solid #FCA5A5', color: '#991B1B' }),
            ...(kvittering.kind === 'neutral' && { color: c.slate2 }),
          }}
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
                <span style={{ fontFamily: monoFont, fontSize: 11, color: c.slate2, background: '#EEF2F7', padding: '2px 8px', borderRadius: 6 }}>{f.aktion}</span>
                <span style={{ fontSize: 12, color: c.sub }}>{tidspunkt(f.oprettet)}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{f.menneske_tekst}</div>
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
            <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 }}>
              Besluttet (sidste 7 dage)
            </div>
            {besluttede.length === 0 && (
              <div style={{ padding: '20px 24px', border: `1.5px dashed ${c.line}`, borderRadius: 14, color: c.slate2, fontSize: 14 }}>
                Ingen beslutninger endnu.
              </div>
            )}
            {besluttede.length > 0 && (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {besluttede.map((f, i) => (
                  <div key={f.id} style={{ padding: '12px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', display: 'flex', alignItems: 'center', gap: sp(3) }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{f.menneske_tekst}</div>
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
  )
}
