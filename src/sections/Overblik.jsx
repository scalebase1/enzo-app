import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, monoFont, sp } from '../ui.js'

// Generisk: vis top-niveau primitive vaerdier som KPI-kort, arrays som antal.
function kpis(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const out = []
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      out.push({ label: k, value: String(v) })
    } else if (Array.isArray(v)) {
      out.push({ label: k, value: `${v.length} rk.` })
    }
  }
  return out
}

export default function Overblik() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.rpc('dashboard_data').then(({ data, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) setErr(error.message)
      else setData(data)
    })
    return () => {
      alive = false
    }
  }, [])

  const cards = kpis(data)

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Overblik</h1>
      <p style={{ color: c.sub, marginTop: 0 }}>
        Ægte data via <code>dashboard_data</code> — beviser at shell + auth + RPC virker i den rigtige app.
      </p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter data …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {cards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: sp(3), marginTop: 16 }}>
          {cards.map((k) => (
            <div key={k.label} style={card}>
              <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', color: c.sub, fontSize: 13 }}>Rå RPC-svar</summary>
          <pre
            style={{
              fontFamily: monoFont,
              fontSize: 12,
              background: c.ink,
              color: '#8ee6a0',
              padding: 12,
              borderRadius: 9,
              overflow: 'auto',
              maxHeight: 340,
              marginTop: 8,
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
