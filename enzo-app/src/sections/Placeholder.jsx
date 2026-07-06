import { c } from '../ui.js'

export default function Placeholder({ title, note }) {
  return (
    <div>
      <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>{title}</h1>
      <p style={{ color: c.sub, marginTop: 0 }}>{note || 'Bygges i en senere fase.'}</p>
      <div
        style={{
          marginTop: 24,
          padding: '48px 24px',
          border: `1.5px dashed ${c.line}`,
          borderRadius: 14,
          textAlign: 'center',
          color: c.slate2,
          fontSize: 14,
        }}
      >
        Placeholder — {title}
      </div>
    </div>
  )
}
