import { c } from '../ui.js'
import Kort from './Kort.jsx'

export default function Noegletalskort({ label, vaerdi, note, fremhaev }) {
  return (
    <Kort padding="14px 16px">
      <div style={{ fontSize: 13, color: c.sub, fontWeight: 400 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: fremhaev ? c.amber : c.ink }}>
        {vaerdi}
      </div>
      {note && <div style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>{note}</div>}
    </Kort>
  )
}
