import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, sp, font } from '../ui.js'

// ---- formatering ----
const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const tal = (n) => Number(n || 0).toLocaleString('da-DK')
// Kompakt beloeb til graf-labels: 138500 -> "139k", 1250000 -> "1,3 mio".
const kompakt = (n) => {
  const v = Number(n || 0)
  if (v >= 1000000) return `${(v / 1000000).toLocaleString('da-DK', { maximumFractionDigits: 1 })} mio`
  if (v >= 1000) return `${Math.round(v / 1000).toLocaleString('da-DK')}k`
  return String(v)
}
const fmtDato = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtTid = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
// to_char(..,'Mon') giver engelske forkortelser; oversaet de to der afviger.
const MDR_DA = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'Maj', Jun: 'Jun', Jul: 'Jul', Aug: 'Aug', Sep: 'Sep', Oct: 'Okt', Nov: 'Nov', Dec: 'Dec' }
// performed_by kan vaere en raa UUID — vis den aldrig som "hvem".
const erUUID = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim())

// ---- byggeklodser ----
function KPI({ label, value, sub, attention }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, marginTop: 6, color: attention ? c.amber : c.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: c.slate2, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function AttnBadge({ n }) {
  if (!n) return null
  return <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>{n}</span>
}

function Kort({ titel, badge, children, style }) {
  return (
    <div style={{ ...card, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', color: c.slate2 }}>{titel}</div>
        <AttnBadge n={badge} />
      </div>
      {children}
    </div>
  )
}

function Tom({ children }) {
  return <div style={{ color: c.sub, fontSize: 14, padding: '4px 0' }}>{children}</div>
}

function Raekke({ children, top }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: top ? `1px solid ${c.line}` : 'none' }}>
      {children}
    </div>
  )
}

function SoejleGraf({ data }) {
  if (!data || data.length === 0) return <Tom>Ingen omsætningsdata.</Tom>
  const max = Math.max(...data.map((d) => d.v || 0), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 200 }}>
      {data.map((d, i) => {
        const sidste = i === data.length - 1
        const h = Math.max(3, Math.round(((d.v || 0) / max) * 150))
        return (
          <div key={d.m + i} title={kr(d.v)} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: sidste ? c.blue : c.slate2 }}>{kompakt(d.v)}</div>
            <div style={{ width: '100%', maxWidth: 48, height: h, borderRadius: '6px 6px 0 0', background: sidste ? c.blue : '#BFDBFE' }} />
            <div style={{ fontSize: 12, color: c.sub, fontWeight: sidste ? 700 : 500 }}>{MDR_DA[d.m] || d.m}</div>
          </div>
        )
      })}
    </div>
  )
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
      if (error) { setErr(error.message); return }
      if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente dashboardet.'); return }
      setData(data)
    })
    return () => { alive = false }
  }, [])

  const n = data?.noegletal || {}
  const godkend = data?.afventer_godkendelse_liste || []
  const fakturaer = data?.manglende_fakturaer_liste || []
  const vagter = data?.aabne_vagter_liste || []
  const koncepter = data?.per_koncept || []
  const aktivitet = data?.seneste_aktivitet || []
  const graf = data?.omsaetning_maanedlig || []

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Overblik</h1>
        {data?.genereret && <span style={{ color: c.sub, fontSize: 13 }}>Opdateret {fmtTid(data.genereret)}</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Driften i tal — og det du skal handle på.</p>

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter dashboardet …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && data && (
        <>
          {/* KPI-kort */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))', gap: sp(3), marginTop: 16 }}>
            <KPI label="Omsætning i år" value={kr(n.omsaetning_aar)} />
            <KPI label="Omsætning denne måned" value={kr(n.omsaetning_maaned)} sub={`${kr(n.omsaetning_sidste_maaned)} sidste md`} />
            <KPI label="Kommende bookinger" value={tal(n.bookinger_kommende)} />
            <KPI label="Arrangementer denne måned" value={tal(n.arrangementer_maaned)} />
            <KPI label="Aktive medarbejdere" value={tal(n.medarbejdere)} />
            <KPI label="Bemandingsgrad" value={`${tal(n.bemandingsgrad)}%`} attention={Number(n.bemandingsgrad) > 0 && Number(n.bemandingsgrad) < 100} />
            <KPI label="Åbne vagter" value={tal(n.aabne_vagter)} sub={Number(n.aabne_vagter) > 0 ? 'kræver bemanding' : 'alle dækket'} attention={Number(n.aabne_vagter) > 0} />
            <KPI label="Manglende fakturaer" value={tal(n.manglende_fakturaer)} sub={kr(n.manglende_fakturaer_beloeb)} attention={Number(n.manglende_fakturaer) > 0} />
            <KPI label="Ventende godkendelser" value={tal(godkend.length)} sub={godkend.length > 0 ? 'medarbejdere' : 'ingen'} attention={godkend.length > 0} />
            <KPI label="Kladder klar" value={tal(n.kladder_klar)} sub={Number(n.kladder_klar) > 0 ? 'klar til afsendelse' : 'ingen'} attention={Number(n.kladder_klar) > 0} />
          </div>

          {/* Omsætning pr. måned */}
          <div style={{ ...card, marginTop: sp(3) }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', color: c.slate2, marginBottom: 6 }}>Omsætning pr. måned</div>
            <SoejleGraf data={graf} />
          </div>

          {/* Handlingskort */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: sp(3), marginTop: sp(3) }}>
            <Kort titel="Ventende Enzo-godkendelser" badge={godkend.length}>
              {godkend.length === 0 ? <Tom>Ingen ventende.</Tom> : godkend.map((g, i) => (
                <Raekke key={g.id} top={i > 0}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{g.navn || 'Ukendt'}</span>
                </Raekke>
              ))}
            </Kort>

            <Kort titel="Manglende fakturaer" badge={fakturaer.length}>
              {fakturaer.length === 0 ? <Tom>Ingen manglende fakturaer.</Tom> : fakturaer.map((f, i) => (
                <Raekke key={f.id} top={i > 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.kunde || 'Ukendt'}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{fmtDato(f.dato)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{kr(f.beloeb)}</div>
                </Raekke>
              ))}
            </Kort>

            <Kort titel="Åbne vagter" badge={vagter.length}>
              {vagter.length === 0 ? <Tom>Alle vagter dækket.</Tom> : vagter.map((v, i) => (
                <Raekke key={v.id} top={i > 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.event || 'Ukendt'}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>
                      {v.koncept && <span style={{ fontWeight: 600 }}>{v.koncept}</span>}{v.koncept ? ' · ' : ''}{fmtDato(v.dato)}
                    </div>
                  </div>
                  {v.rolle && <span style={{ fontSize: 12, color: c.slate2, whiteSpace: 'nowrap' }}>{v.rolle}</span>}
                </Raekke>
              ))}
            </Kort>
          </div>

          {/* Omsætning pr. enhed + Seneste aktivitet */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: sp(3), marginTop: sp(3) }}>
            <Kort titel="Omsætning pr. enhed">
              {koncepter.length === 0 ? <Tom>Ingen lukkede arrangementer denne måned endnu.</Tom> : koncepter.map((k, i) => (
                <Raekke key={k.navn + i} top={i > 0}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: k.farve || c.slate, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{k.navn}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{tal(k.bookinger)} booking{k.bookinger === 1 ? '' : 'er'} · {tal(k.gaester)} gæst{k.gaester === 1 ? '' : 'er'}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{kr(k.omsaetning)}</div>
                </Raekke>
              ))}
            </Kort>

            <Kort titel="Seneste aktivitet">
              {aktivitet.length === 0 ? <Tom>Ingen registreret aktivitet.</Tom> : aktivitet.map((a, i) => (
                <Raekke key={i} top={i > 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{a.handling || '—'}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>
                      {fmtTid(a.tid)}{a.hvem && !erUUID(a.hvem) ? ` · ${a.hvem}` : ''}
                    </div>
                  </div>
                </Raekke>
              ))}
            </Kort>
          </div>
        </>
      )}
    </div>
  )
}
