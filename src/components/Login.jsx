import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, input, font } from '../ui.js'
import { Kort, Pilleknap } from '../komponenter/index.jsx'

// Supabase svarer paa engelsk — oversaet de kendte fejl. Ukendte vises ordret,
// saa vi aldrig skjuler noget vi ikke har forudset.
function daskFejl(besked) {
  const b = String(besked || '')
  if (/invalid login credentials/i.test(b)) return 'Forkert email eller adgangskode.'
  if (/email not confirmed/i.test(b)) return 'Din email er ikke bekræftet endnu.'
  if (/too many requests|rate limit/i.test(b)) return 'For mange forsøg — vent lidt og prøv igen.'
  if (/network|fetch/i.test(b)) return 'Ingen forbindelse — tjek dit internet.'
  return 'Login-fejl: ' + b
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  async function login() {
    setBusy(true)
    setStatus('Logger ind …')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setStatus(daskFejl(error.message))
    // ved succes overtager onAuthStateChange i App
  }

  async function sendReset() {
    if (!email.trim() || !email.includes('@')) {
      setStatus('Skriv din email først.')
      return
    }
    setBusy(true)
    setStatus('Sender reset-link …')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin })
    setBusy(false)
    setStatus(error ? 'Fejl: ' + error.message : 'Hvis emailen findes, er et reset-link på vej. Tjek din indbakke.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, fontFamily: font }}>
      <div style={{ width: 380, maxWidth: 'calc(100vw - 32px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: c.ink }}>Enzo</div>
          <div style={{ fontSize: 13, color: c.sub }}>Casa Food · driftssystem</div>
        </div>
        <Kort>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>{forgot ? 'Nulstil adgangskode' : 'Log ind'}</div>
          <input
            style={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            type="email"
            autoComplete="username"
            onKeyDown={(e) => e.key === 'Enter' && !forgot && login()}
          />
          {!forgot && (
            <input
              style={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="adgangskode"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
          )}
          {!forgot ? (
            <Pilleknap fuldBredde onClick={login} disabled={busy}>
              Log ind
            </Pilleknap>
          ) : (
            <Pilleknap fuldBredde onClick={sendReset} disabled={busy}>
              Send reset-link
            </Pilleknap>
          )}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setForgot(!forgot); setStatus('') }}
              style={{ color: c.accent, fontSize: 13, textDecoration: 'none' }}
            >
              {forgot ? '← Tilbage til login' : 'Glemt adgangskode?'}
            </a>
          </div>
          {status && <div style={{ marginTop: 12, fontSize: 13, color: status.includes('fejl') || status.includes('Fejl') ? c.red : c.sub }}>{status}</div>}
        </Kort>
      </div>
    </div>
  )
}
