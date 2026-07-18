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
      <div style={{ fontSize: 12, color: c.sub }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 500, marginTop: 6, color: attention ? c.amber : c.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: c.slate2, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function AttnBadge({ n }) {
  if (!n) return null
  return <span style={{ background: '#F6EEDD', color: '#8A5F14', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>{n}</span>
}

// audit_log gemmer tekniske handlingsnavne (kladde_slet, admin_handling:vagt_tildel …).
// Backend har endnu ingen handling_tekst() — indtil da oversaetter vi her.
// Praefikset (admin_handling:/medarbejder_handling:) er stoej og fjernes foerst.
const HANDLING_TEKST = {
  booking_opret: 'Booking oprettet', booking_opdater: 'Booking opdateret',
  opdater_booking: 'Booking opdateret', booking_status: 'Booking skiftede status',
  booking_slet: 'Booking slettet', booking_generer_bekraeftelse: 'Bekræftelse dannet',
  kunde_opret: 'Kunde oprettet', kunde_opdater: 'Kunde opdateret',
  opdater_kunde: 'Kunde opdateret', kunde_slet: 'Kunde slettet',
  faktura_opret: 'Fakturakladde oprettet', faktura_udsted: 'Faktura udstedt',
  faktura_send: 'Faktura sendt', faktura_marker_betalt: 'Faktura markeret betalt',
  faktura_slet: 'Faktura slettet',
  gem_kladde: 'Kladde gemt', kladde_opdater: 'Kladde opdateret',
  kladde_slet: 'Kladde slettet', kladde_generer: 'Kladde dannet',
  vagt_opret: 'Vagt oprettet', vagt_tildel: 'Vagt tildelt', vagt_aaben: 'Vagt frigivet',
  vagt_slet: 'Vagt fjernet', vagt_tag: 'Vagt taget', vagt_accepter: 'Vagt bekræftet',
  vagt_afmeld: 'Vagt afmeldt', vagt_byt: 'Vagt byttet', flyt_vagt: 'Vagt flyttet',
  meld_ledig: 'Meldt ledig', fjern_ledig: 'Ledighed fjernet',
  timer_registrer: 'Timer registreret', registrer_timer: 'Timer registreret',
  tilfoej_medarbejder: 'Medarbejder tilføjet', opdater_medarbejder: 'Medarbejder opdateret',
  godkend_medarbejder: 'Medarbejder godkendt', kobl_medarbejder: 'Medarbejder koblet til login',
  medarbejder_generer_link: 'Invitationslink dannet', opdater_loen: 'Timeløn opdateret',
  besked_send: 'Besked sendt', virksomhed_gem: 'Virksomhedsoplysninger gemt',
  enzo_svar: 'Enzo svarede', dashboard_opgave: 'Opgave fra dashboardet',
}

function handlingTekst(h) {
  if (!h) return '—'
  const ren = String(h).split(':').pop()
  return HANDLING_TEKST[ren] || ren.replace(/_/g, ' ').replace(/^./, (t) => t.toUpperCase())
}

function Kort({ titel, badge, children, style }) {
  return (
    <div style={{ ...card, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: c.slate2 }}>{titel}</div>
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
            <div style={{ fontSize: 11, fontWeight: 500, color: sidste ? c.blue : c.slate2 }}>{kompakt(d.v)}</div>
            <div style={{ width: '100%', maxWidth: 48, height: h, borderRadius: '6px 6px 0 0', background: sidste ? c.blue : '#BFDBFE' }} />
            <div style={{ fontSize: 12, color: c.sub, fontWeight: sidste ? 500 : 400 }}>{MDR_DA[d.m] || d.m}</div>
          </div>
        )
      })}
    </div>
  )
}

// System-helbred: vises KUN naar noget kraever handling. Alt rent → intet banner.
function HelbredBanner({ h }) {
  if (!h) return null
  const kritisk = h.email_pipeline_haenger === true
  const advarsler = []
  if (Number(h.medarbejdere_mangler_onboarding) > 0) advarsler.push(`${tal(h.medarbejdere_mangler_onboarding)} medarbejdere mangler invitation — de kan ikke få vagter før de er onboardet.`)
  if (Number(h.fakturaer_uden_nummer) > 0) advarsler.push(`${tal(h.fakturaer_uden_nummer)} fakturaer mangler fakturanummer.`)
  if (Number(h.bookinger_uden_enhed) > 0) advarsler.push(`${tal(h.bookinger_uden_enhed)} bookinger mangler enhed.`)
  if (!kritisk && advarsler.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
      {kritisk && (
        <div style={{ ...card, background: '#F6E7E4', border: '1.5px solid #E0B6AF', color: '#8C3E36' }}>
          <div style={{ fontWeight: 500, fontSize: 15 }}>
            ⚠️ Notifikationer sendes ikke — {tal(h.koe_antal)} beskeder har hængt i {tal(h.koe_aeldste_minutter)} min.
          </div>
        </div>
      )}
      {advarsler.length > 0 && (
        <div style={{ ...card, background: '#FBF6EA', border: '1px solid #E6D6AE', color: '#8A5F14' }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Kræver handling</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {advarsler.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function Overblik() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [helbred, setHelbred] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('dashboard_data').then(({ data, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) { setErr(error.message); return }
      if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente dashboardet.'); return }
      setData(data)
    })
    // Parallelt kald — helbred maa ALDRIG vaelte dashboardet, saa fejl sluges.
    supabase.rpc('system_helbred').then(({ data, error }) => {
      if (!alive) return
      if (error || !data || data.ok === false) return
      setHelbred(data)
    })
    return () => { alive = false }
  }, [])

  const n = data?.noegletal || {}
  const godkend = data?.afventer_godkendelse_liste || []
  const fakturaer = data?.manglende_fakturaer_liste || []
  const vagter = data?.aabne_vagter_liste || []
  const koncepter = data?.per_koncept || []
  // Skjul scheduler-stoej (proaktiv_gennemgang) — kun rigtige haendelser i feedet.
  const aktivitet = (data?.seneste_aktivitet || []).filter((a) => a.handling !== 'proaktiv_gennemgang')
  const graf = data?.omsaetning_maanedlig || []

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Overblik</h1>
        {data?.genereret && <span style={{ color: c.sub, fontSize: 13 }}>Opdateret {fmtTid(data.genereret)}</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Driften i tal — og det du skal handle på.</p>

      <HelbredBanner h={helbred} />

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
            <div style={{ fontSize: 12, fontWeight: 500, color: c.slate2, marginBottom: 6 }}>Omsætning pr. måned</div>
            <SoejleGraf data={graf} />
          </div>

          {/* Handlingskort */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: sp(3), marginTop: sp(3) }}>
            <Kort titel="Ventende Enzo-godkendelser" badge={godkend.length}>
              {godkend.length === 0 ? <Tom>Ingen ventende.</Tom> : godkend.map((g, i) => (
                <Raekke key={g.id} top={i > 0}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{g.navn || 'Ukendt'}</span>
                </Raekke>
              ))}
            </Kort>

            <Kort titel="Manglende fakturaer" badge={fakturaer.length}>
              {fakturaer.length === 0 ? <Tom>Ingen manglende fakturaer.</Tom> : fakturaer.map((f, i) => (
                <Raekke key={f.id} top={i > 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.kunde || 'Ukendt'}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{fmtDato(f.dato)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{kr(f.beloeb)}</div>
                </Raekke>
              ))}
            </Kort>

            <Kort titel="Åbne vagter" badge={vagter.length}>
              {vagter.length === 0 ? <Tom>Alle vagter dækket.</Tom> : vagter.map((v, i) => (
                <Raekke key={v.id} top={i > 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.event || 'Ukendt'}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>
                      {v.koncept && <span style={{ fontWeight: 500 }}>{v.koncept}</span>}{v.koncept ? ' · ' : ''}{fmtDato(v.dato)}
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
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{k.navn}</div>
                    <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{tal(k.bookinger)} booking{k.bookinger === 1 ? '' : 'er'} · {tal(k.gaester)} gæst{k.gaester === 1 ? '' : 'er'}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{kr(k.omsaetning)}</div>
                </Raekke>
              ))}
            </Kort>

            <Kort titel="Seneste aktivitet">
              {aktivitet.length === 0 ? <Tom>Ingen nylig aktivitet.</Tom> : aktivitet.map((a, i) => (
                <Raekke key={i} top={i > 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{handlingTekst(a.handling)}</div>
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
