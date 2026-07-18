import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { c, font, radius, TOUCH } from '../ui.js'
import { useSmalSkaerm } from '../komponenter/useSmalSkaerm.js'

// Under 768px kollapser sidebaren til en skuffe (drawer) bag en menuknap.
// Valgt frem for bundnavigation fordi admin har 12 punkter — en bundlinje
// rummer 3-5. Skuffen skalerer til vilkaarligt mange punkter og giver
// indholdet HELE bredden, hvilket var det egentlige problem paa telefon.
export const MOBIL_TOPBAR_HOEJDE = 56

function Menupunkter({ sections, onNavigeret }) {
  return (
    <nav style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
      {sections.map((s) => (
        <NavLink
          key={s.key}
          to={'/' + s.key}
          onClick={onNavigeret}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '11px 12px',
            minHeight: TOUCH,
            boxSizing: 'border-box',
            borderRadius: 10,
            color: isActive ? '#fff' : c.slate,
            background: isActive ? c.accent : 'transparent',
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: isActive ? 500 : 400 })}
        >
          <span style={{ width: 18, textAlign: 'center', fontSize: 15 }}>{s.icon}</span>
          {s.label}
        </NavLink>
      ))}
    </nav>
  )
}

function Bund({ role, userEmail, onLogout }) {
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${c.navy2}` }}>
      <div style={{ fontSize: 13, color: c.slate }}>
        {role === 'admin' ? 'Administrator' : 'Medarbejder'}
      </div>
      <div style={{ fontSize: 14, color: '#fff', margin: '2px 0 10px', wordBreak: 'break-all' }}>{userEmail}</div>
      <button
        onClick={onLogout}
        style={{
          width: '100%', minHeight: TOUCH, border: `1px solid ${c.navy2}`,
          background: 'transparent', color: c.slate, borderRadius: radius.pille,
          padding: '10px 14px', fontSize: 14, fontFamily: font, cursor: 'pointer' }}
      >
        Log ud
      </button>
    </div>
  )
}

function Maerke() {
  return (
    <div style={{ padding: '20px 18px 12px' }}>
      <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>Enzo</div>
      <div style={{ fontSize: 13, color: c.slate }}>Casa Food</div>
    </div>
  )
}

export default function Sidebar({ sections, userEmail, role, onLogout }) {
  const smal = useSmalSkaerm()
  const [aaben, setAaben] = useState(false)
  const sti = useLocation().pathname

  // Luk skuffen ved navigation og naar skaermen bliver bred igen.
  useEffect(() => { setAaben(false) }, [sti])
  useEffect(() => { if (!smal) setAaben(false) }, [smal])

  // Laas baggrundsscroll mens skuffen er aaben.
  useEffect(() => {
    if (!aaben) return
    const forrige = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = forrige }
  }, [aaben])

  const panel = {
    background: c.navy,
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font }

  if (!smal) {
    return <aside style={{ ...panel, width: 240, flexShrink: 0 }}>
      <Maerke />
      <Menupunkter sections={sections} />
      <Bund role={role} userEmail={userEmail} onLogout={onLogout} />
    </aside>
  }

  const aktiv = sections.find((s) => sti.startsWith('/' + s.key))

  return (
    <>
      {/* Fast topbar med menuknap. Indholdet under faar hele bredden. */}
      <header
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: MOBIL_TOPBAR_HOEJDE,
          background: c.navy, color: '#fff', display: 'flex', alignItems: 'center',
          gap: 12, padding: '0 12px', zIndex: 50, fontFamily: font }}
      >
        <button
          onClick={() => setAaben(true)}
          aria-label="Åbn menu"
          aria-expanded={aaben}
          style={{
            width: TOUCH, height: TOUCH, flexShrink: 0, border: `1px solid ${c.navy2}`,
            background: 'transparent', color: '#fff', borderRadius: 10,
            fontSize: 18, lineHeight: 1, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}
        >
          ☰
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {aktiv ? aktiv.label : 'Enzo'}
          </div>
        </div>
      </header>

      {aaben && (
        <div
          onClick={() => setAaben(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,25,.45)', zIndex: 70 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...panel, position: 'absolute', top: 0, left: 0, bottom: 0, width: 260, maxWidth: '86vw' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <Maerke />
              <button
                onClick={() => setAaben(false)}
                aria-label="Luk menu"
                style={{
                  width: TOUCH, height: TOUCH, margin: '14px 10px 0 0', flexShrink: 0,
                  border: 'none', background: 'transparent', color: c.slate,
                  fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <Menupunkter sections={sections} onNavigeret={() => setAaben(false)} />
            <Bund role={role} userEmail={userEmail} onLogout={onLogout} />
          </div>
        </div>
      )}
    </>
  )
}
