import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, input, font } from '../ui.js'
import { Kort, Pilleknap } from '../komponenter/index.jsx'

// Vises ved recovery/invite-landing. detectSessionInUrl (default) etablerer
// sessionen; her promptes ny kode og updateUser() kaldes. Docs-mønster.
export default function SetPassword({ type }) {
  const [pw, setPw] = useState('')
  const [ready, setReady] = useState(false)
  const [waited, setWaited] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) setReady(true) })
    const t = setTimeout(() => setWaited(true), 5000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function save() {
    if (pw.length < 8) { setStatus('Mindst 8 tegn.'); return }
    setBusy(true); setStatus('Gemmer …')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setStatus('Fejl: ' + error.message); return }
    setStatus('Adgangskode gemt ✓ — logger ind …')
    try { window.history.replaceState(null, '', window.location.pathname) } catch {}
    setTimeout(() => window.location.reload(), 1200)
  }

  const title = type === 'invite' ? 'Vælg din adgangskode' : 'Sæt ny adgangskode'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, fontFamily: font }}>
      <div style={{ width: 380, maxWidth: 'calc(100vw - 32px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: c.ink }}>Enzo</div>
          <div style={{ fontSize: 13, color: c.sub }}>Casa Food</div>
        </div>
        <Kort>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: c.green, marginBottom: 14 }}>Link modtaget ✓</div>

          {!ready && !waited && <div style={{ color: c.sub, fontSize: 14 }}>Klargør …</div>}

          {!ready && waited && (
            <div style={{ color: c.red, fontSize: 14 }}>
              Kunne ikke etablere en session fra linket — det kan være udløbet eller allerede brugt.
              Bed om et nyt link via “Glemt adgangskode?”.
            </div>
          )}

          {ready && (
            <>
              <input
                style={input}
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Adgangskode (min. 8 tegn)"
                autoComplete="new-password"
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
              <Pilleknap fuldBredde onClick={save} disabled={busy}>
                Gem adgangskode
              </Pilleknap>
            </>
          )}

          {status && <div style={{ marginTop: 12, fontSize: 13, color: status.includes('Fejl') ? c.red : c.sub }}>{status}</div>}
        </Kort>
      </div>
    </div>
  )
}
