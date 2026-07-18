import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, input, font } from '../ui.js'

export default function Virksomhed() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [vaerdier, setVaerdier] = useState({})     // aktuelle input-vaerdier pr. noegle
  const [oprindelig, setOprindelig] = useState({}) // til at sende KUN aendrede felter (flet)
  const [busy, setBusy] = useState(false)
  const [fejl, setFejl] = useState('')
  const [kvittering, setKvittering] = useState('')

  // Byg input-state ud fra "felter" (feltlisten er backendens — aldrig hardkodet).
  const anvend = useCallback((d) => {
    setData(d)
    const v = {}
    for (const f of d.felter || []) {
      const raa = d.virksomhed?.[f.noegle]
      v[f.noegle] = raa != null ? String(raa) : ''
    }
    setVaerdier(v)
    setOprindelig(v)
  }, [])

  const load = useCallback(async () => {
    setErr('')
    const { data, error } = await supabase.rpc('virksomhed_hent')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente virksomhedsoplysninger.'); return }
    anvend(data)
  }, [anvend])

  useEffect(() => { load() }, [load])

  const felter = data?.felter || []
  const mangler = data?.mangler || []
  const klar = data?.klar_til_fakturering

  // Kun aendrede felter — backenden fletter.
  const aendringer = () => {
    const a = {}
    for (const f of felter) {
      const k = f.noegle
      if ((vaerdier[k] ?? '') !== (oprindelig[k] ?? '')) a[k] = vaerdier[k]
    }
    return a
  }
  const dirty = Object.keys(aendringer()).length > 0

  async function gem() {
    if (busy) return
    const a = aendringer()
    if (Object.keys(a).length === 0) return
    setBusy(true); setFejl(''); setKvittering('')
    // virksomhed_gem(p_data jsonb): ét jsonb-arg — de aendrede felter fletter ind.
    const { data: res, error } = await supabase.rpc('virksomhed_gem', { p_data: a })
    setBusy(false)
    if (error) { setFejl('Fejl: ' + error.message); return }
    // Backenden validerer og returnerer en laesbar dansk fejl — vist ORDRET.
    if (!res || res.ok === false) { setFejl(res?.fejl || 'Kunne ikke gemme.'); return }
    setKvittering('Virksomhedsoplysninger gemt.')
    load()
  }

  return (
    <div style={{ fontFamily: font, maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Virksomhedsoplysninger</h1>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Bruges på fakturaer — CVR, adresse, bankkonto m.m. Fakturaer kan først sendes når de påkrævede felter er udfyldt.
      </p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && data && (
        <>
          {kvittering && (
            <div style={{ ...card, marginTop: 16, background: '#E7EFE7', border: '1px solid #BFD3C1', color: '#3B6349', fontWeight: 500, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span>{kvittering}</span>
              <button onClick={() => setKvittering('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          )}

          {/* Rolig note — ikke en fejl, bare noget der endnu ikke er sat. */}
          {klar === false && (
            <div style={{ ...card, marginTop: 16, background: '#FBF6EA', border: '1px solid #E6D6AE', color: '#8A5F14', fontSize: 14 }}>
              Udfyld disse felter for at kunne sende fakturaer.
            </div>
          )}
          {klar === true && (
            <div style={{ ...card, marginTop: 16, background: '#E7EFE7', border: '1px solid #BFD3C1', color: '#3B6349', fontSize: 14, fontWeight: 500 }}>
              ✓ Klar til fakturering.
            </div>
          )}

          <div style={{ ...card, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {felter.map((f) => {
              const savner = f.paakraevet && mangler.includes(f.noegle)
              return (
                <div key={f.noegle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: c.sub }}>{f.label}</span>
                    {f.paakraevet && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: savner ? '#B45309' : c.slate }}>{savner ? 'påkrævet — mangler' : 'påkrævet'}</span>
                    )}
                  </div>
                  <input
                    style={{ ...input, marginBottom: 0, ...(savner ? { border: '1.5px solid #F59E0B', background: '#FBF6EA' } : {}) }}
                    value={vaerdier[f.noegle] ?? ''}
                    onChange={(e) => setVaerdier((v) => ({ ...v, [f.noegle]: e.target.value }))}
                    disabled={busy}
                  />
                  {f.hjaelp && <div style={{ fontSize: 12, color: c.slate2, marginTop: 4 }}>{f.hjaelp}</div>}
                </div>
              )
            })}

            {felter.length === 0 && <div style={{ color: c.sub, fontSize: 14 }}>Ingen felter at vise.</div>}
            {fejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 500 }}>{fejl}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={{ ...btn, opacity: (busy || !dirty) ? 0.55 : 1 }} disabled={busy || !dirty} onClick={gem}>
                {busy ? 'Gemmer …' : 'Gem'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
