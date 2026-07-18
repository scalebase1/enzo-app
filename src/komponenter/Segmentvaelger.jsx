import { c, radius, font, TOUCH } from '../ui.js'

// Vandret pille-vaelger (fx statusfilter). Aktivt segment faar salvie-accenten.
// Scroller vandret INDE i sin egen container, aldrig hele siden.
export default function Segmentvaelger({ muligheder, valgt, onVaelg, style }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, ...style }}>
      {muligheder.map((m) => {
        const aktiv = m.key === valgt
        return (
          <button
            key={m.key}
            onClick={() => onVaelg(m.key)}
            style={{
              flexShrink: 0, minHeight: TOUCH, padding: '9px 16px',
              borderRadius: radius.pille, fontFamily: font, fontSize: 14,
              fontWeight: aktiv ? 500 : 400, cursor: 'pointer',
              border: `1px solid ${aktiv ? c.accent : c.line}`,
              background: aktiv ? c.accent : c.card,
              color: aktiv ? '#fff' : c.sub,
            }}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
