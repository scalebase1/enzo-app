import { useState, useEffect, useCallback } from 'react'
import { supabase, SUPABASE_ANON } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, sp } from '../ui.js'
import { StatusChip } from '../komponenter/index.jsx'
import { useSmalSkaerm } from '../komponenter/useSmalSkaerm.js'

const ONBOARD = 'https://vakumjnnmfyqkcoxqcra.supabase.co/functions/v1/medarbejder-onboard'


// Uden login endnu → kan inviteres.
const kanInviteres = (status) => status === 'afventer_medarbejder' || status === 'afventer_godkendelse'

export default function Medarbejdere() {
  const smal = useSmalSkaerm()
  const [liste, setListe] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [navn, setNavn] = useState('')
  const [email, setEmail] = useState('')
  const [loen, setLoen] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('medarbejdere_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente liste.'); return }
    setListe(data.medarbejdere || [])
  }, [])

  useEffect(() => { load() }, [load])

  // Inviter eksisterende medarbejder (uden login) — egen dialog + state.
  const [inviter, setInviter] = useState(null) // staff-raekke der inviteres
  const [invEmail, setInvEmail] = useState('')
  const [invBusy, setInvBusy] = useState(false)
  const [invFejl, setInvFejl] = useState('')
  const [kvittering, setKvittering] = useState('')

  function aabnInviter(m) {
    setInviter(m); setInvEmail(m.email || ''); setInvFejl(''); setKvittering('')
  }

  async function sendInvitation() {
    if (invBusy || !inviter) return
    const e = invEmail.trim().toLowerCase()
    if (!e || !e.includes('@')) { setInvFejl('Skriv en gyldig email.'); return }
    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    if (!tok) { setInvFejl('Session udløbet — genindlæs.'); return }

    setInvBusy(true); setInvFejl('')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(ONBOARD, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: inviter.id, email: e }),
        signal: ctrl.signal })
      clearTimeout(timer)
      const raw = await res.text()
      let d = null
      try { d = JSON.parse(raw) } catch { /* ignore */ }
      setInvBusy(false)
      if (!res.ok || !d || d.ok === false) {
        // Ordret fejl fra backend (ikke en generisk besked).
        setInvFejl(d && d.fejl ? d.fejl : 'Fejlede (' + res.status + ').')
        return
      }
      setKvittering(d.besked || 'Invitation sendt.')
      setInviter(null)
      load()
    } catch (er) {
      clearTimeout(timer); setInvBusy(false)
      setInvFejl(er && er.name === 'AbortError' ? 'Timeout — prøv igen.' : 'Uventet fejl — prøv igen.')
    }
  }

  async function opret() {
    const n = navn.trim(), e = email.trim().toLowerCase(), l = parseFloat(loen || '0')
    if (!n) { setFormStatus('Skriv et navn.'); return }
    if (!e || !e.includes('@')) { setFormStatus('Skriv en gyldig email.'); return }
    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    if (!tok) { setFormStatus('Session udløbet — genindlæs.'); return }

    setBusy(true); setFormStatus('Sender invitation …')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(ONBOARD, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ navn: n, email: e, timeloen: isNaN(l) ? 0 : l, redirectTo: window.location.origin }),
        signal: ctrl.signal })
      clearTimeout(timer)
      const raw = await res.text()
      let d = null
      try { d = JSON.parse(raw) } catch { /* ignore */ }
      setBusy(false)
      if (!res.ok || !d || d.ok === false) {
        setFormStatus(d && d.fejl ? 'Fejlede: ' + d.fejl : 'Fejlede (' + res.status + ').')
        return
      }
      setFormStatus(d.besked || 'Invitation sendt til ' + e)
      setNavn(''); setEmail(''); setLoen('')
      load()
      setTimeout(() => { setShowForm(false); setFormStatus('') }, 2600)
    } catch (er) {
      clearTimeout(timer); setBusy(false)
      setFormStatus(er && er.name === 'AbortError' ? 'Timeout — prøv igen.' : 'Uventet fejl — prøv igen.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Medarbejdere</h1>
          <p style={{ color: c.sub, marginTop: 0 }}>Liste + invitér nye medarbejdere. De sætter selv deres kode via invite-linket.</p>
        </div>
        <button style={btn} onClick={() => { setShowForm(!showForm); setFormStatus('') }}>
          {showForm ? 'Luk' : '+ Ny medarbejder'}
        </button>
      </div>

      {kvittering && (
        <div style={{ ...card, marginTop: 16, background: '#E7EFE7', border: '1px solid #BFD3C1', color: '#3B6349', fontWeight: 500, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span>{kvittering}</span>
          <button onClick={() => setKvittering('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {showForm && (
        <div style={{ ...card, marginTop: 16, maxWidth: 460 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Ny medarbejder</div>
          <input style={input} value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Navn" />
          <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input style={input} type="number" inputMode="decimal" value={loen} onChange={(e) => setLoen(e.target.value)} placeholder="Timeløn (kr.)" />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={opret} disabled={busy}>Send invitation</button>
            <button style={btnGhost} onClick={() => { setShowForm(false); setFormStatus('') }}>Annuller</button>
          </div>
          {formStatus && <div style={{ marginTop: 12, fontSize: 13, color: formStatus.includes('Fejl') || formStatus.includes('fejl') || formStatus.includes('Timeout') ? c.red : c.green }}>{formStatus}</div>}
        </div>
      )}

      <div style={{ ...card, marginTop: 16, padding: 0, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 20, color: c.sub }}>Henter …</div>}
        {err && <div style={{ padding: 20, color: c.red }}>Fejl: {err}</div>}
        {liste && liste.length === 0 && <div style={{ padding: 20, color: c.sub }}>Ingen medarbejdere endnu.</div>}
        {/* Mobil: tabellen bliver til en kortliste. Samme data, samme handlinger,
            men uden vandret scroll. */}
        {liste && liste.length > 0 && smal && liste.map((m, i) => (
          <div key={m.id} style={{ padding: '14px 16px', borderTop: i > 0 ? `1px solid ${c.line}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: c.ink }}>{m.navn}</div>
              <Badge status={m.onboarding_status} aktiv={m.aktiv} tekst={m.status_tekst} />
            </div>
            <div style={{ fontSize: 14, color: c.sub, marginTop: 4, overflowWrap: 'anywhere' }}>{m.email || '—'}</div>
            <div style={{ fontSize: 14, color: c.sub, marginTop: 2 }}>
              {m.timeloen != null ? m.timeloen + ' kr./time' : 'Ingen timeløn'}
            </div>
            {kanInviteres(m.onboarding_status) && (
              <button style={{ ...btn, marginTop: 10, width: '100%' }} onClick={() => aabnInviter(m)}>Inviter</button>
            )}
          </div>
        ))}

        {liste && liste.length > 0 && !smal && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: c.sub, fontSize: 12 }}>
                <th style={{ padding: '12px 16px' }}>Navn</th>
                <th style={{ padding: '12px 16px' }}>Email</th>
                <th style={{ padding: '12px 16px' }}>Timeløn</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${c.line}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{m.navn}</td>
                  <td style={{ padding: '12px 16px', color: c.sub }}>{m.email || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{m.timeloen != null ? m.timeloen + ' kr.' : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge status={m.onboarding_status} aktiv={m.aktiv} tekst={m.status_tekst} /></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {kanInviteres(m.onboarding_status) && (
                      <button style={{ ...btn, padding: '6px 12px', fontSize: 13 }} onClick={() => aabnInviter(m)}>Inviter</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, color: c.sub, marginBottom: 8 }}>Chat</div>
        <div style={{ padding: '32px 24px', border: `1px dashed ${c.line}`, borderRadius: 12, textAlign: 'center', color: c.sub, fontSize: 15, background: c.card }}>
          Medarbejder-chat — bygges i en senere fase.
        </div>
      </div>

      {inviter && (
        <div
          onClick={invBusy ? undefined : () => setInviter(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 420, maxWidth: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: c.ink }}>Inviter {inviter.navn}</div>
            <div style={{ fontSize: 13, color: c.sub, margin: '8px 0 14px' }}>
              Medarbejderen får et link til at sætte sin egen kode. Indtast den email invitationen skal sendes til.
            </div>
            <input style={input} type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="medarbejder@email.dk" disabled={invBusy} />
            {invFejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 500, marginBottom: 10 }}>{invFejl}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...btnGhost, opacity: invBusy ? 0.6 : 1 }} onClick={() => setInviter(null)} disabled={invBusy}>Annuller</button>
              <button style={{ ...btn, opacity: invBusy ? 0.6 : 1 }} onClick={sendInvitation} disabled={invBusy}>{invBusy ? 'Sender …' : 'Send invitation'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
