// Design-tokens — ScaleBase/Casa Food. Restrained, funktionel intern app.
export const c = {
  blue: '#0066FF',
  blueDim: '#3384ff',
  ink: '#0A0E1A',
  navy: '#0F1729',
  navy2: '#161F33',
  slate: '#94A3B8',
  slate2: '#64748B',
  line: '#E5E7EB',
  bg: '#F7F8FA',
  card: '#FFFFFF',
  text: '#0A0E1A',
  sub: '#667085',
  green: '#15803D',
  red: '#991B1B',
  amber: '#B45309',
}

export const sp = (n) => `${n * 4}px`

export const font =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
export const monoFont = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export const card = {
  background: c.card,
  border: `1px solid ${c.line}`,
  borderRadius: 14,
  padding: 20,
}

export const btn = {
  border: 'none',
  background: c.blue,
  color: '#fff',
  borderRadius: 9,
  padding: '11px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

export const btnGhost = {
  ...btn,
  background: '#EEF2F7',
  color: '#334155',
}

export const input = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${c.line}`,
  borderRadius: 9,
  padding: 11,
  fontSize: 14,
  fontFamily: font,
  marginBottom: 10,
}
