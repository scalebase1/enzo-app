import { useState, useEffect } from 'react'

// Under dette brud kollapser sidebaren, og indhold fylder fuld bredde.
export const MOBIL_BRUD = 768

// Inline styles kan ikke media queries — derfor matchMedia.
export function useSmalSkaerm(bred = MOBIL_BRUD) {
  const forespoergsel = `(max-width: ${bred - 1}px)`
  const [smal, setSmal] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(forespoergsel).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(forespoergsel)
    const h = (e) => setSmal(e.matches)
    setSmal(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [forespoergsel])
  return smal
}
