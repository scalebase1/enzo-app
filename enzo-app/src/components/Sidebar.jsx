import { NavLink } from 'react-router-dom'
import { c, font } from '../ui.js'

export default function Sidebar({ sections, userEmail, role, onLogout }) {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: c.navy,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: font,
      }}
    >
      <div style={{ padding: '22px 18px 14px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.01em' }}>Enzo</div>
        <div style={{ fontSize: 12, color: c.slate }}>Casa Food</div>
      </div>

      <nav style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map((s) => (
          <NavLink
            key={s.key}
            to={'/' + s.key}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '10px 12px',
              borderRadius: 9,
              color: isActive ? '#fff' : c.slate,
              background: isActive ? c.blue : 'transparent',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
            })}
          >
            <span style={{ width: 18, textAlign: 'center', fontSize: 15 }}>{s.icon}</span>
            {s.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: 14, borderTop: `1px solid ${c.navy2}` }}>
        <div style={{ fontSize: 11, color: c.slate, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {role === 'admin' ? 'Administrator' : 'Medarbejder'}
        </div>
        <div style={{ fontSize: 13, color: '#fff', margin: '2px 0 10px', wordBreak: 'break-all' }}>{userEmail}</div>
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            border: `1px solid ${c.navy2}`,
            background: 'transparent',
            color: c.slate,
            borderRadius: 8,
            padding: 8,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Log ud
        </button>
      </div>
    </aside>
  )
}
