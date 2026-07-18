import { c, radius } from '../ui.js'

export default function TomTilstand({ tekst, children }) {
  return (
    <div style={{
      padding: '16px 18px', border: `1px dashed ${c.line}`, borderRadius: radius.kort,
      color: c.sub, fontSize: 15, background: c.card,
    }}>
      {tekst}
      {children}
    </div>
  )
}
