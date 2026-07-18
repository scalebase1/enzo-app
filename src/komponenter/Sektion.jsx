import { sektionTitel } from '../ui.js'

// Overskrift over en liste/blok. Saetnings-case, ingen versaler.
export default function Sektion({ titel, hoejre, children, style }) {
  return (
    <div style={{ marginTop: 20, ...style }}>
      {(titel || hoejre) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          {titel && <div style={sektionTitel}>{titel}</div>}
          {hoejre}
        </div>
      )}
      {children}
    </div>
  )
}
