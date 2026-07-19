import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'
import { tone } from '../ui.js'

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const fmtDato = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtTid = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function TypeBadge({ type }) {
  return <StatusChip tekst={cap(type) || '—'} farve={tone.neutral} />
}

// Bevarer den eksisterende ordlyd ("Afventer dig" fortaeller hvem bolden ligger hos)
// frem for en generisk label.
function StatusBadge({ status }) {
  const sendt = status === 'sendt'
  return <StatusChip status={status} tekst={sendt ? 'Sendt' : 'Afventer dig'} farve={sendt ? tone.ok : tone.advarsel} />
}


function Overlay({ lukVedBackdrop, onClose, width = 620, children }) {
  const ned = useRef(false)
  const props = lukVedBackdrop
    ? { onMouseDown: (e) => { ned.current = e.target === e.currentTarget }, onClick: (e) => { if (ned.current && e.target === e.currentTarget) onClose() } }
    : {}
  return (
    <div {...props} style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60, fontFamily: font }}>
      <div style={{ ...card, width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

const feltLabel = { fontSize: 11, fontWeight: 500, color: c.sub, marginBottom: 4 }

// Læse-visning (sendt) — backdrop lukker gerne, ingen redigering.
export function SendtVisning({ kladde, onClose }) {
  return (
    <Overlay lukVedBackdrop onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>{kladde.emne || '(uden emne)'}</div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: 'pointer', padding: 0 }}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={kladde.type} /><StatusBadge status="sendt" />
      </div>
      <div style={{ fontSize: 14 }}>
        <div><span style={{ color: c.sub }}>Til:</span> <span style={{ fontWeight: 500 }}>{kladde.modtager || '—'}</span>{kladde.kunde ? <span style={{ color: c.sub }}> · {kladde.kunde}</span> : null}</div>
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: c.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>{kladde.besked}</div>
      <div style={{ fontSize: 12.5, color: c.slate2, borderTop: `1px solid ${c.line}`, paddingTop: 12 }}>
        Sendt {fmtTid(kladde.sendt_at)} til {kladde.modtager}
      </div>
    </Overlay>
  )
}

// Redigér + send (klar) — backdrop lukker IKKE (datatab).
export function KladdeRediger({ kladde, onClose, onDone, onRefresh }) {
  const [emne, setEmne] = useState(kladde.emne || '')
  const [modtager, setModtager] = useState(kladde.modtager || '')
  const [besked, setBesked] = useState(kladde.besked || '')
  const [bekraeft, setBekraeft] = useState(null) // null | 'send' | 'slet'
  const [busy, setBusy] = useState(null)         // null | 'send' | 'gem' | 'slet'
  const [fejl, setFejl] = useState('')

  // Kun ændrede felter sendes; backend-nøgler er emne/tekst/email (verificeret).
  const aendringer = useMemo(() => {
    const a = {}
    if (emne !== (kladde.emne || '')) a.emne = emne
    if (besked !== (kladde.besked || '')) a.tekst = besked
    if (modtager !== (kladde.modtager || '')) a.email = modtager
    return a
  }, [emne, besked, modtager, kladde])
  const dirty = Object.keys(aendringer).length > 0
  const laast = !!busy

  async function gemAendringer() {
    const { data, error } = await supabase.rpc('admin_handling', { p_aktion: 'kladde_opdater', p_payload: { id: kladde.id, ...aendringer } })
    if (error) return { ok: false, fejl: 'Fejl: ' + error.message }
    if (!data || data.ok === false) return { ok: false, fejl: data?.fejl || 'Kunne ikke gemme.' }
    return { ok: true }
  }

  async function gem() {
    if (laast || !dirty) return
    setBusy('gem'); setFejl('')
    const r = await gemAendringer()
    setBusy(null)
    if (!r.ok) { setFejl(r.fejl); return }
    onDone('Ændringer gemt.')
  }

  async function send() {
    if (laast) return
    setBusy('send'); setFejl('')
    // Gem evt. aendringer foerst, saa mailen afspejler det brugeren ser.
    let forGemt = false
    if (dirty) {
      const r = await gemAendringer()
      if (!r.ok) { setBusy(null); setBekraeft(null); setFejl(r.fejl); return }
      forGemt = true
    }
    const { data, error } = await supabase.rpc('kladde_send', { p_id: kladde.id })
    setBusy(null); setBekraeft(null)
    // For-gemningen aendrede DB — genindlaes baggrundslisten selv hvis send fejler,
    // saa kortet ikke viser stale data (modalen forbliver aaben m. brugerens tekst).
    if (error) { if (forGemt) onRefresh?.(); setFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { if (forGemt) onRefresh?.(); setFejl(data?.fejl || 'Kunne ikke sende.'); return }
    onDone(`Sendt til ${data.modtager}.`)
  }

  async function slet() {
    if (laast) return
    setBusy('slet'); setFejl('')
    const { data, error } = await supabase.rpc('admin_handling', { p_aktion: 'kladde_slet', p_payload: { id: kladde.id } })
    setBusy(null); setBekraeft(null)
    if (error) { setFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { setFejl(data?.fejl || 'Kunne ikke slette.'); return }
    onDone('Kladde slettet.')
  }

  const inputU = { ...input, marginBottom: 0 }
  const kanSende = !!modtager.trim() && !!besked.trim()

  return (
    <Overlay lukVedBackdrop={false} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: c.ink }}>Gennemgå & send</div>
        <button onClick={onClose} disabled={laast} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: laast ? 'default' : 'pointer', opacity: laast ? 0.5 : 1, padding: 0 }}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={kladde.type} /><StatusBadge status="klar" />
        {kladde.kunde && <span style={{ fontSize: 13, color: c.sub }}>{kladde.kunde}</span>}
      </div>

      <div>
        <div style={feltLabel}>Modtager</div>
        <input style={inputU} type="email" value={modtager} onChange={(e) => setModtager(e.target.value)} placeholder="kunde@email.dk" disabled={laast} />
      </div>
      <div>
        <div style={feltLabel}>Emne</div>
        <input style={inputU} value={emne} onChange={(e) => setEmne(e.target.value)} placeholder="Emne" disabled={laast} />
      </div>
      <div>
        <div style={feltLabel}>Besked</div>
        <textarea rows={10} style={{ ...inputU, resize: 'vertical', fontFamily: font }} value={besked} onChange={(e) => setBesked(e.target.value)} placeholder="Beskeden til kunden …" disabled={laast} />
      </div>

      {fejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 500 }}>{fejl}</div>}

      {bekraeft === 'send' ? (
        <div style={{ ...card, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.ink }}>Send til {modtager}? Dette er en rigtig mail til kunden.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={{ ...btnGhost, opacity: laast ? 0.6 : 1 }} onClick={() => setBekraeft(null)} disabled={laast}>Fortryd</button>
            <button style={{ ...btn, opacity: laast ? 0.6 : 1 }} onClick={send} disabled={laast}>{busy === 'send' ? 'Sender …' : 'Ja, send til kunde'}</button>
          </div>
        </div>
      ) : bekraeft === 'slet' ? (
        <div style={{ ...card, background: '#F6E7E4', border: '1px solid #E0B6AF', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#8C3E36' }}>Slet denne kladde permanent?</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={{ ...btnGhost, opacity: laast ? 0.6 : 1 }} onClick={() => setBekraeft(null)} disabled={laast}>Fortryd</button>
            <button style={{ ...btn, background: c.red, opacity: laast ? 0.6 : 1 }} onClick={slet} disabled={laast}>{busy === 'slet' ? 'Sletter …' : 'Slet'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...btn, background: c.green, opacity: (laast || !kanSende) ? 0.55 : 1 }} disabled={laast || !kanSende} onClick={() => { setFejl(''); setBekraeft('send') }}>Send til kunde</button>
          <button style={{ ...btnGhost, opacity: (laast || !dirty) ? 0.55 : 1 }} disabled={laast || !dirty} onClick={gem}>{busy === 'gem' ? 'Gemmer …' : 'Gem ændringer'}</button>
          <button style={{ ...btnGhost, color: c.red, marginLeft: 'auto', opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={() => { setFejl(''); setBekraeft('slet') }}>Slet</button>
        </div>
      )}
    </Overlay>
  )
}

export function KladdeKort({ kladde, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: font, display: 'flex', flexDirection: 'column', gap: 0, borderLeft: kladde.status === 'klar' ? '4px solid #F59E0B' : `1px solid ${c.line}` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <StatusBadge status={kladde.status} />
        <span style={{ fontSize: 12, color: c.slate2 }}>{fmtDato(kladde.oprettet)}</span>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 500, color: c.ink, marginTop: 10, overflowWrap: 'anywhere' }}>{kladde.emne || '(uden emne)'}</div>
      <div style={{ fontSize: 13, color: c.sub, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Til: {kladde.modtager || '—'}{kladde.kunde ? ` · ${kladde.kunde}` : ''}
      </div>
      {kladde.besked && (
        <div style={{ fontSize: 13, color: c.slate2, marginTop: 8, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{kladde.besked}</div>
      )}
      {kladde.lead && (
        <div style={{ fontSize: 12.5, color: c.sub, marginTop: 8 }}>
          Svar til {kladde.lead.navn}
        </div>
      )}
      <div style={{ marginTop: 12 }}><TypeBadge type={kladde.type} /></div>
    </button>
  )
}
