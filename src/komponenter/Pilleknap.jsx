import { btn, btnGhost, c, TOUCH } from '../ui.js'

// variant: 'fyldt' (moerk) | 'omrids'. Altid mindst 44px hoej.
export default function Pilleknap({
  variant = 'fyldt', children, style, disabled, fuldBredde, lille, fare, ...rest
}) {
  const grund = variant === 'omrids' ? btnGhost : btn
  return (
    <button
      disabled={disabled}
      style={{
        ...grund,
        ...(lille ? { padding: '8px 14px', fontSize: 14, minHeight: 36 } : { minHeight: TOUCH }),
        ...(fuldBredde ? { width: '100%' } : null),
        ...(fare ? (variant === 'omrids' ? { color: c.red } : { background: c.red }) : null),
        ...(disabled ? { opacity: 0.55, cursor: 'default' } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
