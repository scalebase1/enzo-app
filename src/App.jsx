import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient.js'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import Overblik from './sections/Overblik.jsx'
import Placeholder from './sections/Placeholder.jsx'
import { c, font, btn } from './ui.js'

// admin:true = kun admin (William). admin:false = admin + medarbejder.
const ALL_SECTIONS = [
  { key: 'overblik', label: 'Overblik', icon: '▦', admin: true },
  { key: 'medarbejdere', label: 'Medarbejdere', icon: '◉', admin: true },
  { key: 'kalender', label: 'Kalender', icon: '▤', admin: false },
  { key: 'enzo', label: 'Enzo', icon: '✦', admin: true },
  { key: 'notifikationer', label: 'Notifikationer', icon: '◔', admin: false },
]

function FullMsg({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, color: c.sub }}>
      {children}
    </div>
  )
}

function NoAccess({ email }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, flexDirection: 'column', gap: 12, background: c.bg }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Ingen adgang</div>
      <div style={{ color: c.sub }}>{email} er hverken admin eller aktiv medarbejder.</div>
      <button style={btn} onClick={() => supabase.auth.signOut()}>Log ud</button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined=indlæser, null=ikke logget ind, obj=logget ind
  const [role, setRole] = useState(undefined) // undefined=bestemmer, 'admin'|'medarbejder'|'none'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) setRole(undefined)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    setRole(undefined)
    ;(async () => {
      const { data: isAdmin } = await supabase.rpc('er_admin')
      if (!alive) return
      if (isAdmin === true) {
        setRole('admin')
        return
      }
      const { data: staffId } = await supabase.rpc('aktuel_medarbejder')
      if (!alive) return
      setRole(staffId ? 'medarbejder' : 'none')
    })()
    return () => {
      alive = false
    }
  }, [session])

  if (session === undefined) return <FullMsg>Indlæser …</FullMsg>
  if (!session) return <Login />
  if (role === undefined) return <FullMsg>Bestemmer rolle …</FullMsg>
  if (role === 'none') return <NoAccess email={session.user.email} />

  const sections = ALL_SECTIONS.filter((s) => role === 'admin' || !s.admin)
  const home = role === 'admin' ? 'overblik' : 'kalender'
  const adminOnly = (el) => (role === 'admin' ? el : <Navigate to={'/' + home} replace />)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: font, background: c.bg }}>
      <Sidebar sections={sections} userEmail={session.user.email} role={role} onLogout={() => supabase.auth.signOut()} />
      <main style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<Navigate to={'/' + home} replace />} />
          <Route path="/overblik" element={adminOnly(<Overblik />)} />
          <Route path="/medarbejdere" element={adminOnly(<Placeholder title="Medarbejdere" note="Liste + ny medarbejder + chat — bygges i en senere fase." />)} />
          <Route path="/kalender" element={<Placeholder title="Kalender" note="Google-Calendar-grade kalender med ledighed + auto-tildeling — senere fase." />} />
          <Route path="/enzo" element={adminOnly(<Placeholder title="Enzo" note="Assistent + godkendelser — senere fase." />)} />
          <Route path="/notifikationer" element={<Placeholder title="Notifikationer" note="Mail-baserede push-notifikationer — senere fase." />} />
          <Route path="*" element={<Navigate to={'/' + home} replace />} />
        </Routes>
      </main>
    </div>
  )
}
