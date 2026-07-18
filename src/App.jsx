import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, authLandingType } from './supabaseClient.js'
import Login from './components/Login.jsx'
import SetPassword from './components/SetPassword.jsx'
import Sidebar, { MOBIL_TOPBAR_HOEJDE } from './components/Sidebar.jsx'
import { useSmalSkaerm } from './komponenter/useSmalSkaerm.js'
import Forside from './sections/Forside.jsx'
import Overblik from './sections/Overblik.jsx'
import Medarbejdere from './sections/Medarbejdere.jsx'
import Kunder from './sections/Kunder.jsx'
import Fakturaer from './sections/Fakturaer.jsx'
import Loen from './sections/Loen.jsx'
import Viden from './sections/Viden.jsx'
import Virksomhed from './sections/Virksomhed.jsx'
import Madkoncepter from './sections/Madkoncepter.jsx'
import Kladder from './sections/Kladder.jsx'
import Enzo from './sections/Enzo.jsx'
import Kalender from './sections/Kalender.jsx'
import Beskeder from './sections/Beskeder.jsx'
import Notifikationer from './sections/Notifikationer.jsx'
import { c, font, btn } from './ui.js'

// admin:true = kun admin (William). admin:false = admin + medarbejder.
const ALL_SECTIONS = [
  { key: 'forside', label: 'Forside', icon: '⌂', admin: false },
  { key: 'overblik', label: 'Overblik', icon: '▦', admin: true },
  { key: 'medarbejdere', label: 'Medarbejdere', icon: '◉', admin: true },
  { key: 'kunder', label: 'Kunder', icon: '◎', admin: true },
  { key: 'fakturaer', label: 'Fakturaer', icon: '❑', admin: true },
  { key: 'loen', label: 'Løn', icon: '¤', admin: true },
  { key: 'viden', label: 'Viden', icon: '◈', admin: true },
  { key: 'virksomhed', label: 'Virksomhed', icon: '◫', admin: true },
  { key: 'madkoncepter', label: 'Madkoncepter', icon: '❖', admin: true },
  { key: 'kladder', label: 'Kladder', icon: '✎', admin: true },
  { key: 'kalender', label: 'Kalender', icon: '▤', admin: false },
  { key: 'beskeder', label: 'Beskeder', icon: '✉', admin: false },
  { key: 'enzo', label: 'Enzo', icon: '✦', admin: true },
  { key: 'notifikationer', label: 'Notifikationer', icon: '◔', admin: true },
]

function FullMsg({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, color: c.sub, textAlign: 'center', padding: 24 }}>
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
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(undefined)
  const smal = useSmalSkaerm()

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
      if (isAdmin === true) { setRole('admin'); return }
      const { data: staffId } = await supabase.rpc('aktuel_medarbejder')
      if (!alive) return
      setRole(staffId ? 'medarbejder' : 'none')
    })()
    return () => { alive = false }
  }, [session])

  // Recovery/invite-landing tager forrang over normal-flow (til reload efter kode-saet).
  if (authLandingType?.error) return <FullMsg>Linket kunne ikke bruges: {authLandingType.error}</FullMsg>
  if (authLandingType?.type) return <SetPassword type={authLandingType.type} />

  if (session === undefined) return <FullMsg>Indlæser …</FullMsg>
  if (!session) return <Login />
  if (role === undefined) return <FullMsg>Bestemmer rolle …</FullMsg>
  if (role === 'none') return <NoAccess email={session.user.email} />

  const sections = ALL_SECTIONS.filter((s) => role === 'admin' || !s.admin)
  // Forsiden er foerste skaerm efter login for begge roller.
  const home = 'forside'
  const adminOnly = (el) => (role === 'admin' ? el : <Navigate to={'/' + home} replace />)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: font, background: c.bg }}>
      <Sidebar sections={sections} userEmail={session.user.email} role={role} onLogout={() => supabase.auth.signOut()} />
      {/* minWidth:0 er afgoerende: uden den kan flex-boernene tvinge hele
          siden bredere end skaermen og skabe vandret scroll. */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'hidden',
          padding: smal ? `${MOBIL_TOPBAR_HOEJDE + 16}px 16px 32px` : '28px 32px',
        }}
      >
        <Routes>
          <Route path="/" element={<Navigate to={'/' + home} replace />} />
          <Route path="/forside" element={<Forside />} />
          <Route path="/overblik" element={adminOnly(<Overblik />)} />
          <Route path="/medarbejdere" element={adminOnly(<Medarbejdere />)} />
          <Route path="/kunder" element={adminOnly(<Kunder />)} />
          <Route path="/fakturaer" element={adminOnly(<Fakturaer />)} />
          <Route path="/loen" element={adminOnly(<Loen />)} />
          <Route path="/viden" element={adminOnly(<Viden />)} />
          <Route path="/virksomhed" element={adminOnly(<Virksomhed />)} />
          <Route path="/madkoncepter" element={adminOnly(<Madkoncepter />)} />
          <Route path="/kladder" element={adminOnly(<Kladder />)} />
          <Route path="/kalender" element={<Kalender />} />
          <Route path="/beskeder" element={<Beskeder />} />
          <Route path="/enzo" element={adminOnly(<Enzo />)} />
          <Route path="/notifikationer" element={adminOnly(<Notifikationer />)} />
          <Route path="*" element={<Navigate to={'/' + home} replace />} />
        </Routes>
      </main>
    </div>
  )
}
