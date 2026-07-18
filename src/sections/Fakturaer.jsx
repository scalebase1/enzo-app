import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, font, monoFont } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'

const kr = (n) => `${Number(n || 0).toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`
const fmtDato = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}
// vat_rate kan komme som 0.25 (andel) eller 25 (procent) — normalisér til procent.
const momsSats = (r) => (r == null ? null : `${Math.round(Number(r) <= 1 ? Number(r) * 100 : Number(r))}%`)

const STATUS = {
  kladde: { bg: '#F2F1ED', col: '#5B584F', txt: 'Kladde' },
  udstedt: { bg: '#F6EEDD', col: '#8A5F14', txt: 'Udstedt' }, // udstedt ≠ sendt: nr. tildelt, men kunden har intet fået endnu
  sendt: { bg: '#EAEEE5', col: '#4B5A40', txt: 'Sendt' },
  betalt: { bg: '#E7EFE7', col: '#3B6349', txt: 'Betalt' } }

// faktura_tekst/faktura_send returnerer denne fejl ordret når stamdata mangler — signal til at vise link.
const MANGLER_VIRKSOMHED = 'Virksomhedsoplysninger mangler'

// Backendens paene danske label (status_tekst) vinder; ellers den lokale tabel.
function StatusBadge({ status, tekst }) {
  return <StatusChip status={status} tekst={tekst || STATUS[status]?.txt} />
}

function FilterPill({ aktiv, onClick, tekst, antal }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1.5px solid ${aktiv ? c.ink : c.line}`,
        background: aktiv ? c.ink : c.card,
        color: aktiv ? '#fff' : c.slate2,
        borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: font,
        display: 'inline-flex', alignItems: 'center', gap: 7 }}
    >
      {tekst}
      <span style={{ fontSize: 12, fontWeight: 500, color: aktiv ? '#fff' : c.slate, opacity: aktiv ? 0.85 : 1 }}>{antal}</span>
    </button>
  )
}

function Detalje({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: c.sub }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500, marginTop: 3 }}>{value}</div>
    </div>
  )
}

// Link til stamdata-sektionen — vises når en fejl skyldes manglende virksomhedsoplysninger.
function VirksomhedLink() {
  return (
    <Link to="/virksomhed" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 500, color: c.blue, textDecoration: 'none' }}>
      Gå til Virksomhedsoplysninger →
    </Link>
  )
}

// Læse-modal (backdrop lukker) — matcher husets overlay-idiom.
function Overlay({ onClose, width = 640, children }) {
  const ned = useRef(false)
  return (
    <div
      onMouseDown={(e) => { ned.current = e.target === e.currentTarget }}
      onClick={(e) => { if (ned.current && e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60, fontFamily: font }}
    >
      <div style={{ ...card, width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

export default function Fakturaer() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('alle')
  const [udvidet, setUdvidet] = useState(() => new Set())
  const [busyId, setBusyId] = useState(null)        // faktura-id el. booking-id under handling
  const [handlingFejl, setHandlingFejl] = useState('')
  const [kvittering, setKvittering] = useState(null)
  const [preview, setPreview] = useState(null)      // { id, kunde, loading, res, fejl } — forhåndsvisning (sender intet)

  const load = useCallback(async () => {
    setErr('')
    const { data, error } = await supabase.rpc('faktura_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente fakturaer.'); return }
    setData(data)
  }, [])

  useEffect(() => { load() }, [load])

  const fakturaer = data?.fakturaer || []
  const manglende = data?.manglende || []

  const antal = useMemo(() => {
    const a = { alle: fakturaer.length, kladde: 0, udstedt: 0, sendt: 0, betalt: 0 }
    for (const f of fakturaer) if (a[f.status] != null) a[f.status]++
    return a
  }, [fakturaer])

  // faktura_liste returnerer allerede nyeste (created_at) foerst — bevar den orden.
  const synlige = filter === 'alle' ? fakturaer : fakturaer.filter((f) => f.status === filter)

  function toggle(id) {
    setUdvidet((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Kør et RPC-kald, vis fejl/kvittering, genindlæs. nyKvittering(data) -> streng|null.
  async function udfoer(busyKey, kald, nyKvittering) {
    setBusyId(busyKey); setHandlingFejl(''); setKvittering(null)
    const { data: res, error } = await kald()
    if (error) { setBusyId(null); setHandlingFejl('Fejl: ' + error.message); return }
    if (!res || res.ok === false) { setBusyId(null); setHandlingFejl(res?.fejl || 'Handlingen fejlede.'); return }
    const k = nyKvittering ? nyKvittering(res) : null
    if (k) setKvittering(k)
    await load()
    setBusyId(null)
  }

  // busy-noegler navngives pr. handling (ikke kun id), da Udsted og Slet deler
  // samme faktura-id og ellers ville vise spinneren paa den forkerte knap.
  const udsted = (f) => udfoer(
    `udsted:${f.id}`,
    () => supabase.rpc('admin_faktura_udsted', { p_id: f.id }),
    (res) => `Faktura ${res.invoice_number} udstedt til ${f.kunde} — ${kr(res.gross)} inkl. moms ${kr(res.vat)}.`,
  )
  const markerBetalt = (f) => udfoer(
    `betalt:${f.id}`,
    () => supabase.rpc('admin_handling', { p_aktion: 'faktura_marker_betalt', p_payload: { id: f.id } }),
    () => (f.nummer ? `Faktura ${f.nummer} markeret som betalt.` : 'Faktura markeret som betalt.'),
  )
  const slet = (f) => udfoer(
    `slet:${f.id}`,
    () => supabase.rpc('admin_handling', { p_aktion: 'faktura_slet', p_payload: { id: f.id } }),
    () => `Kladde slettet — bookingen ligger nu under "Manglende fakturaer" igen.`,
  )
  const opret = (m) => udfoer(
    `opret:${m.booking_id}`,
    () => supabase.rpc('admin_handling', { p_aktion: 'faktura_opret', p_payload: { booking_id: m.booking_id } }),
    () => `Kladde oprettet for ${m.kunde}.`,
  )
  // Send: udstedt → sendt. Vis backendens "besked" ved succes; fejl vises ordret via udfoer.
  const send = (f) => udfoer(
    `send:${f.id}`,
    () => supabase.rpc('faktura_send', { p_id: f.id }),
    (res) => res.besked || `Faktura ${res.fakturanummer} sendt til ${res.modtager}.`,
  )

  // Forhåndsvis: kald faktura_tekst (sender INTET), vis resultatet i en dialog.
  async function forhaandsvis(f) {
    setPreview({ id: f.id, kunde: f.kunde, loading: true, res: null, fejl: '' })
    const { data: res, error } = await supabase.rpc('faktura_tekst', { p_id: f.id })
    setPreview((p) => {
      if (!p || p.id !== f.id) return p   // en anden forhåndsvisning er åbnet i mellemtiden
      if (error) return { ...p, loading: false, fejl: 'Fejl: ' + error.message }
      if (!res || res.ok === false) return { ...p, loading: false, fejl: res?.fejl || 'Kunne ikke hente fakturateksten.' }
      return { ...p, loading: false, res }
    })
  }

  const laast = busyId != null

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Fakturaer</h1>
        {data && <span style={{ color: c.sub, fontSize: 14 }}>{fakturaer.length} faktura{fakturaer.length === 1 ? '' : 'er'} · {manglende.length} mangler</span>}
      </div>
      <p style={{ color: c.sub, marginTop: 0 }}>Faktura-livscyklus: kladde → udstedt → sendt → betalt. Opret manglende fakturaer fra bookinger.</p>

      {kvittering && (
        <div style={{ ...card, marginTop: 16, background: '#E7EFE7', border: '1px solid #BFD3C1', color: '#3B6349', fontWeight: 500, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span>{kvittering}</span>
          <button onClick={() => setKvittering(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
      {handlingFejl && (
        <div style={{ ...card, marginTop: 16, background: '#F6E7E4', border: '1px solid #E0B6AF', color: '#8C3E36', fontWeight: 500, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div>{handlingFejl}</div>
            {handlingFejl.includes(MANGLER_VIRKSOMHED) && <VirksomhedLink />}
          </div>
          <button onClick={() => setHandlingFejl('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter fakturaer …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {/* data-gate uden !err: en fejlet genindlaesning efter en handling maa
          ikke blanke listen — err-banneret ovenfor er da en ikke-blokerende note. */}
      {!loading && data && (
        <>
          {fakturaer.length > 0 && (
            <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
              <FilterPill aktiv={filter === 'alle'} onClick={() => setFilter('alle')} tekst="Alle" antal={antal.alle} />
              <FilterPill aktiv={filter === 'kladde'} onClick={() => setFilter('kladde')} tekst="Kladder" antal={antal.kladde} />
              <FilterPill aktiv={filter === 'udstedt'} onClick={() => setFilter('udstedt')} tekst="Udstedt" antal={antal.udstedt} />
              <FilterPill aktiv={filter === 'sendt'} onClick={() => setFilter('sendt')} tekst="Sendt" antal={antal.sendt} />
              <FilterPill aktiv={filter === 'betalt'} onClick={() => setFilter('betalt')} tekst="Betalt" antal={antal.betalt} />
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: fakturaer.length > 0 ? 0 : 16 }}>
            {fakturaer.length === 0 && <div style={{ padding: 20, color: c.sub }}>Ingen fakturaer endnu.</div>}
            {fakturaer.length > 0 && synlige.length === 0 && <div style={{ padding: 20, color: c.sub }}>Ingen fakturaer med denne status.</div>}
            {synlige.map((f, i) => {
              const aaben = udvidet.has(f.id)
              // moms er altid NULL paa en kladde og foerst sat efter udstedelse
              // — brug den som signal, saa en kladde ikke viser "Moms 0 kr".
              const harBeregning = f.moms != null
              return (
                <div key={f.id} style={{ borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
                  <div
                    onClick={() => toggle(f.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
                  >
                    <span style={{ color: c.slate, fontSize: 12, width: 12 }}>{aaben ? '▾' : '▸'}</span>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {f.nummer || <span style={{ color: c.slate2, fontWeight: 500 }}>—</span>}
                      </div>
                      <div style={{ fontSize: 13, color: c.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.kunde || 'Ukendt'}</div>
                    </div>
                    <div style={{ fontSize: 12.5, color: c.slate2, minWidth: 84 }}>{f.enhed || '—'}</div>
                    <div style={{ fontSize: 12.5, color: c.slate2, minWidth: 96 }}>{fmtDato(f.dato)}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, minWidth: 92, textAlign: 'right' }}>{kr(f.beloeb)}</div>
                    <StatusBadge status={f.status} tekst={f.status_tekst} />
                    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      {f.status === 'kladde' && (
                        <>
                          <button style={{ ...btnGhost, padding: '7px 12px', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => forhaandsvis(f)}>Forhåndsvis</button>
                          <button style={{ ...btn, padding: '7px 12px', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => udsted(f)}>
                            {busyId === `udsted:${f.id}` ? '…' : 'Udsted'}
                          </button>
                          <button style={{ ...btnGhost, padding: '7px 12px', color: c.red, opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => slet(f)}>
                            {busyId === `slet:${f.id}` ? 'Sletter …' : 'Slet'}
                          </button>
                        </>
                      )}
                      {f.status === 'udstedt' && (
                        <>
                          <button style={{ ...btnGhost, padding: '7px 12px', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => forhaandsvis(f)}>Forhåndsvis</button>
                          <button style={{ ...btn, padding: '7px 12px', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => send(f)}>
                            {busyId === `send:${f.id}` ? 'Sender …' : 'Send faktura'}
                          </button>
                        </>
                      )}
                      {f.status === 'sendt' && (
                        <button style={{ ...btn, background: c.green, padding: '7px 12px', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => markerBetalt(f)}>
                          {busyId === `betalt:${f.id}` ? '…' : 'Markér betalt'}
                        </button>
                      )}
                      {f.status === 'betalt' && <span style={{ fontSize: 13, color: c.slate2, alignSelf: 'center' }}>✓ Færdig</span>}
                    </div>
                  </div>
                  {aaben && (
                    <div style={{ padding: '0 16px 16px 40px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                      {harBeregning ? (
                        <>
                          <Detalje label="Netto" value={kr(f.net)} />
                          <Detalje label="Moms" value={kr(f.moms)} />
                          <Detalje label="Momssats" value={momsSats(f.moms_sats) || '—'} />
                          <Detalje label="I alt" value={kr(f.beloeb)} />
                        </>
                      ) : (
                        <div style={{ fontSize: 13.5, color: c.sub }}>Moms beregnes når kladden udstedes. Beløb i alt: {kr(f.beloeb)}.</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Manglende fakturaer */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: c.slate2 }}>Manglende fakturaer</div>
              {manglende.length > 0 && <span style={{ background: '#F6EEDD', color: '#8A5F14', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>{manglende.length}</span>}
            </div>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {manglende.length === 0 ? (
                <div style={{ padding: '18px 16px', color: c.sub, fontSize: 14 }}>Alle bookinger er faktureret.</div>
              ) : manglende.map((m, i) => (
                <div key={m.booking_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.kunde || 'Ukendt'}</div>
                    <div style={{ fontSize: 12.5, color: c.sub, marginTop: 2 }}>{m.enhed ? `${m.enhed} · ` : ''}{fmtDato(m.dato)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, minWidth: 92, textAlign: 'right' }}>{kr(m.beloeb)}</div>
                  <button style={{ ...btn, padding: '8px 12px', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => opret(m)}>
                    {busyId === `opret:${m.booking_id}` ? 'Opretter …' : 'Opret faktura'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {preview && (
        <Overlay onClose={() => setPreview(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Forhåndsvisning</h2>
              <div style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>{preview.kunde || 'Ukendt kunde'} · der sendes ingenting</div>
            </div>
            <button onClick={() => setPreview(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: c.slate2, fontSize: 22, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>

          {preview.loading && <div style={{ color: c.sub, fontSize: 14 }}>Henter fakturatekst …</div>}

          {preview.fejl && (
            <div style={{ background: '#F6E7E4', border: '1px solid #E0B6AF', color: '#8C3E36', borderRadius: 10, padding: '12px 14px', fontSize: 14, fontWeight: 500 }}>
              <div>{preview.fejl}</div>
              {preview.fejl.includes(MANGLER_VIRKSOMHED) && <VirksomhedLink />}
            </div>
          )}

          {preview.res && (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <Detalje label="Emne" value={preview.res.emne || '—'} />
                <Detalje label="Modtager" value={preview.res.modtager || '—'} />
                <Detalje label="Forfald" value={fmtDato(preview.res.forfald)} />
                <Detalje label="I alt" value={kr(preview.res.beloeb)} />
              </div>
              <pre style={{ fontFamily: monoFont, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre', overflowX: 'auto', background: c.bg, border: `1px solid ${c.line}`, borderRadius: 10, padding: 14, margin: 0, color: c.text }}>{preview.res.tekst}</pre>
              <div style={{ fontSize: 12.5, color: c.sub }}>Dette er kun en forhåndsvisning — der er ikke sendt noget til kunden.</div>
            </>
          )}
        </Overlay>
      )}
    </div>
  )
}
