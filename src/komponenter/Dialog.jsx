import { c, radius, font } from '../ui.js'
import { useSmalSkaerm } from './useSmalSkaerm.js'

// Modal-ramme. Paa mobil fylder den naesten hele skaermen og scroller indeni,
// saa siden bagved aldrig scroller vandret.
export default function Dialog({ children, onClose, bredde = 560, lukVedBackdrop = true }) {
  const smal = useSmalSkaerm()
  return (
    <div
      onClick={lukVedBackdrop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,27,25,.45)',
        display: 'flex', alignItems: smal ? 'flex-end' : 'center', justifyContent: 'center',
        padding: smal ? 0 : 20, zIndex: 60, fontFamily: font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.card, border: `1px solid ${c.line}`,
          borderRadius: smal ? `${radius.kort}px ${radius.kort}px 0 0` : radius.kort,
          padding: smal ? 18 : 20,
          width: smal ? '100%' : bredde, maxWidth: '100%',
          maxHeight: smal ? '92vh' : '88vh', overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}
