import { card } from '../ui.js'

// Flade med 1px kant og 12px radius. Ingen skygge.
export default function Kort({ children, style, padding, ...rest }) {
  return (
    <div style={{ ...card, ...(padding != null ? { padding } : null), ...style }} {...rest}>
      {children}
    </div>
  )
}
