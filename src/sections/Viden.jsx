import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient.js'
import { c, card, btn, btnGhost, input, font } from '../ui.js'

const fmtDato = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE = {
  tekst: { bg: '#F1F5F9', col: '#334155', txt: 'Tekst' },
  billede: { bg: '#F3E8FF', col: '#6B21A8', txt: 'Billede' },
  dokument: { bg: '#FEF3C7', col: '#92400E', txt: 'Dokument' },
}

const erBillede = (v) => !!v?.fil_url && typeof v?.mime === 'string' && v.mime.startsWith('image/')

// Fjern mellemrum/specialtegn/non-ascii fra filnavn til storage-stien.
const saniter = (navn) => {
  const s = (navn || 'fil').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
  return s || 'fil'
}

function TypeBadge({ type }) {
  const t = TYPE[type] || { bg: '#F1F5F9', col: c.slate2, txt: type || '—' }
  return <span style={{ background: t.bg, color: t.col, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{t.txt}</span>
}

function TagChips({ tags }) {
  if (!tags || tags.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
      {tags.map((t, i) => (
        <span key={`${t}-${i}`} style={{ background: '#EEF2F7', color: c.slate2, fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6 }}>{t}</span>
      ))}
    </div>
  )
}

// lukVedBackdrop=false til formularer (undgaa datatab); true til laese-/bekraeft-modaler.
function Overlay({ lukVedBackdrop, onClose, width = 560, children }) {
  const ned = useRef(false)
  const props = lukVedBackdrop
    ? {
        onMouseDown: (e) => { ned.current = e.target === e.currentTarget },
        onClick: (e) => { if (ned.current && e.target === e.currentTarget) onClose() },
      }
    : {}
  return (
    <div {...props} style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60, fontFamily: font }}>
      <div style={{ ...card, width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function ModalHead({ titel, onClose, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.ink, overflowWrap: 'anywhere' }}>{titel}</div>
      <button onClick={onClose} disabled={disabled} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: c.slate2, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, padding: 0 }}>×</button>
    </div>
  )
}

const feltLabel = { fontSize: 11, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 4 }

// ---------- Formular (opret/rediger) ----------
function VidenForm({ viden, onClose, onSaved }) {
  const erRedigering = !!viden
  const [titel, setTitel] = useState(viden?.titel || '')
  const [type, setType] = useState(viden?.type || 'tekst')
  const [tagsInput, setTagsInput] = useState((viden?.tags || []).join(', '))
  const [indhold, setIndhold] = useState(viden?.indhold || '')
  const [fil, setFil] = useState(null)          // ny valgt File
  const [fjernFil, setFjernFil] = useState(false)
  const [filKey, setFilKey] = useState(0)        // nulstiller <input type=file>
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [fejl, setFejl] = useState('')

  const eksFil = erRedigering && viden.fil_url && !fjernFil

  function vaelgFil(f) {
    setFil(f)
    setFjernFil(false)
    if (f?.type) setType(f.type.startsWith('image/') ? 'billede' : 'dokument')
  }

  async function gem() {
    if (busy) return
    setFejl('')
    if (!titel.trim()) { setFejl('Titel er påkrævet.'); return }
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    // Backenden bevarer eksisterende tags hvis en tom array sendes ved rediger,
    // saa total-rydning er umulig via RPC'en — bloker med en aerlig besked frem
    // for at lade handlingen fejle tavst.
    if (erRedigering && (viden.tags?.length || 0) > 0 && tags.length === 0) {
      setFejl('Mindst ét tag er påkrævet — tags kan ikke fjernes helt her.'); return
    }

    setBusy(true)
    const p = {
      titel: titel.trim(),
      type,
      tags,
      indhold, // sendes altid (tom → ryddes ved rediger, jf. RPC)
    }
    if (erRedigering) p.id = viden.id

    // Fil-felter sendes KUN når de faktisk ændres, ellers bevarer RPC den gamle fil.
    if (fil) {
      const sti = `${Date.now()}-${saniter(fil.name)}`
      setStatus('Uploader fil …')
      const { error: upErr } = await supabase.storage.from('videnbase').upload(sti, fil)
      if (upErr) { setBusy(false); setStatus(''); setFejl('Upload fejlede: ' + upErr.message); return }
      p.fil_url = supabase.storage.from('videnbase').getPublicUrl(sti).data.publicUrl
      p.fil_sti = sti
      p.mime = fil.type
    } else if (erRedigering && fjernFil) {
      p.fil_url = ''; p.fil_sti = ''; p.mime = ''
    }

    setStatus('Gemmer …')
    const { data, error } = await supabase.rpc('viden_gem', { p_data: p })
    if (error || !data || data.ok === false) {
      // Ryd den netop uploadede fil op, saa et fejlet gem ikke efterlader en
      // foraeldreloes fil i bucket'en (kun naar vi faktisk uploadede denne gang).
      if (fil && p.fil_sti) await supabase.storage.from('videnbase').remove([p.fil_sti]).catch(() => {})
      setBusy(false); setStatus('')
      setFejl(error ? 'Fejl: ' + error.message : (data?.fejl || 'Kunne ikke gemme.'))
      return
    }
    setBusy(false); setStatus('')
    onSaved()
  }

  const inputU = { ...input, marginBottom: 0 }

  return (
    <Overlay lukVedBackdrop={false} onClose={onClose} width={580}>
      <ModalHead titel={erRedigering ? 'Rediger viden' : 'Ny viden'} onClose={onClose} disabled={busy} />

      <div>
        <div style={feltLabel}>Titel</div>
        <input style={inputU} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Fx “Allergener – Casanova pizza”" />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={feltLabel}>Type</div>
          <select style={inputU} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="tekst">Tekst</option>
            <option value="billede">Billede</option>
            <option value="dokument">Dokument</option>
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 0 }}>
          <div style={feltLabel}>Tags (kommasepareret) — det Enzo søger på</div>
          <input style={inputU} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="pris, allergener, DTU" />
        </div>
      </div>

      <div>
        <div style={feltLabel}>Indhold</div>
        <textarea rows={6} style={{ ...inputU, resize: 'vertical', fontFamily: font }} value={indhold} onChange={(e) => setIndhold(e.target.value)} placeholder="Den viden Enzo skal kunne slå op og svare kunder ud fra …" />
      </div>

      <div>
        <div style={feltLabel}>Fil (valgfri) — billede eller dokument</div>
        <input key={filKey} type="file" onChange={(e) => vaelgFil(e.target.files?.[0] || null)} style={{ fontSize: 13, fontFamily: font }} />
        {fil && (
          <div style={{ fontSize: 13, color: c.slate2, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            Valgt: <span style={{ fontWeight: 600 }}>{fil.name}</span>
            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }} onClick={() => { setFil(null); setFilKey((k) => k + 1) }}>Fortryd</button>
          </div>
        )}
        {!fil && eksFil && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            {erBillede(viden)
              ? <img src={viden.fil_url} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: `1px solid ${c.line}` }} />
              : <a href={viden.fil_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: c.blue }}>Nuværende fil</a>}
            <button style={{ ...btnGhost, padding: '5px 11px', fontSize: 12, color: c.red }} onClick={() => setFjernFil(true)}>Fjern fil</button>
          </div>
        )}
        {!fil && erRedigering && fjernFil && (
          <div style={{ fontSize: 13, color: c.slate2, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            Filen fjernes ved gem.
            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }} onClick={() => setFjernFil(false)}>Fortryd</button>
          </div>
        )}
      </div>

      {status && <div style={{ fontSize: 13, color: c.slate2 }}>{status}</div>}
      {fejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 600 }}>{fejl}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }} onClick={onClose} disabled={busy}>Annuller</button>
        <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={gem} disabled={busy}>
          {busy ? 'Gemmer …' : (erRedigering ? 'Gem ændringer' : 'Opret viden')}
        </button>
      </div>
    </Overlay>
  )
}

// ---------- Læse-modal ----------
function VidenLaes({ viden, onClose }) {
  return (
    <Overlay lukVedBackdrop onClose={onClose} width={620}>
      <ModalHead titel={viden.titel} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={viden.type} />
        {viden.oprettet && <span style={{ fontSize: 12.5, color: c.sub }}>Oprettet {fmtDato(viden.oprettet)}</span>}
      </div>
      <TagChips tags={viden.tags} />
      {viden.indhold && (
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: c.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{viden.indhold}</div>
      )}
      {viden.fil_url && (
        erBillede(viden)
          ? <img src={viden.fil_url} alt={viden.titel} style={{ maxWidth: '100%', borderRadius: 10, border: `1px solid ${c.line}` }} />
          : <a href={viden.fil_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, alignSelf: 'flex-start', textDecoration: 'none' }}>Åbn vedhæftet fil</a>
      )}
    </Overlay>
  )
}

// ---------- Slet-bekræftelse ----------
function SletDialog({ viden, busy, fejl, onBekraeft, onClose }) {
  return (
    <Overlay lukVedBackdrop={!busy} onClose={onClose} width={420}>
      <div style={{ fontSize: 17, fontWeight: 800, color: c.ink }}>Slet viden?</div>
      <div style={{ fontSize: 14, color: c.sub }}>
        “{viden.titel}” slettes permanent. Enzo kan ikke længere slå den op. Handlingen kan ikke fortrydes.
      </div>
      {fejl && <div style={{ fontSize: 13, color: c.red, fontWeight: 600 }}>{fejl}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }} onClick={onClose} disabled={busy}>Annuller</button>
        <button style={{ ...btn, background: c.red, opacity: busy ? 0.6 : 1 }} onClick={onBekraeft} disabled={busy}>{busy ? 'Sletter …' : 'Slet'}</button>
      </div>
    </Overlay>
  )
}

// ---------- Kort ----------
function VidenKort({ viden, onLaes, onRediger, onSlet, laast }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div onClick={onLaes} style={{ cursor: 'pointer', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <TypeBadge type={viden.type} />
          {viden.oprettet && <span style={{ fontSize: 12, color: c.slate2 }}>{fmtDato(viden.oprettet)}</span>}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: c.ink, marginTop: 10, overflowWrap: 'anywhere' }}>{viden.titel}</div>
        <TagChips tags={viden.tags} />
        {erBillede(viden) && (
          <img src={viden.fil_url} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 10, border: `1px solid ${c.line}`, marginTop: 10 }} />
        )}
        {viden.indhold && (
          <div style={{ fontSize: 13.5, color: c.sub, marginTop: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {viden.indhold}
          </div>
        )}
        {!viden.indhold && !erBillede(viden) && viden.fil_url && (
          <div style={{ fontSize: 13, color: c.slate2, marginTop: 10 }}>Vedhæftet fil</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.line}` }}>
        <button style={{ ...btnGhost, padding: '7px 12px', fontSize: 13, opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={onRediger}>Rediger</button>
        <button style={{ ...btnGhost, padding: '7px 12px', fontSize: 13, color: c.red, opacity: laast ? 0.6 : 1 }} disabled={laast} onClick={onSlet}>Slet</button>
      </div>
    </div>
  )
}

export default function Viden() {
  const [liste, setListe] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [soeg, setSoeg] = useState('')
  const [form, setForm] = useState(null)       // null | { viden: obj|null }
  const [laes, setLaes] = useState(null)       // null | obj
  const [sletKandidat, setSletKandidat] = useState(null)
  const [sletBusy, setSletBusy] = useState(false)
  const [handlingFejl, setHandlingFejl] = useState('')

  const load = useCallback(async () => {
    setErr('')
    const { data, error } = await supabase.rpc('viden_liste')
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data || data.ok === false) { setErr(data?.fejl || 'Kunne ikke hente videnbasen.'); return }
    setListe(data.viden || [])
  }, [])

  useEffect(() => { load() }, [load])

  const synlige = useMemo(() => {
    const q = soeg.trim().toLowerCase()
    if (!q) return liste || []
    return (liste || []).filter((v) =>
      (v.titel || '').toLowerCase().includes(q)
      || (v.indhold || '').toLowerCase().includes(q)
      || (v.tags || []).some((t) => (t || '').toLowerCase().includes(q)),
    )
  }, [liste, soeg])

  function gemt() { setForm(null); load() }

  async function slet() {
    if (!sletKandidat) return
    setSletBusy(true); setHandlingFejl('')
    const { data, error } = await supabase.rpc('viden_slet', { p_id: sletKandidat.id })
    setSletBusy(false)
    if (error) { setHandlingFejl('Fejl: ' + error.message); return }
    if (!data || data.ok === false) { setHandlingFejl(data?.fejl || 'Kunne ikke slette.'); return }
    setSletKandidat(null)
    load()
  }

  const total = liste?.length ?? 0
  const laast = sletBusy

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Viden</h1>
        {liste && <span style={{ color: c.sub, fontSize: 14 }}>{total} post{total === 1 ? '' : 'er'}</span>}
        <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setForm({ viden: null })}>+ Ny viden</button>
      </div>
      <p style={{ color: c.sub, margin: '6px 0 0' }}>
        Enzos hukommelse: den viden Enzo slår op for at svare kunder korrekt — priser, allergener, kunde-specifik info m.m. <strong>Tags</strong> er det Enzo søger på.
      </p>

      {!loading && !err && liste && total > 0 && (
        <input
          style={{ ...input, maxWidth: 360, marginTop: 14 }}
          value={soeg}
          onChange={(e) => setSoeg(e.target.value)}
          placeholder="Søg på titel, tags eller indhold …"
        />
      )}

      {loading && <div style={{ ...card, marginTop: 16, color: c.sub }}>Henter videnbasen …</div>}
      {err && <div style={{ ...card, marginTop: 16, color: c.red }}>RPC-fejl: {err}</div>}

      {!loading && !err && liste && (
        total === 0 ? (
          <div style={{ ...card, marginTop: 16, color: c.sub }}>Ingen viden endnu. Klik “+ Ny viden” for at lære Enzo noget.</div>
        ) : synlige.length === 0 ? (
          <div style={{ ...card, marginTop: 16, color: c.sub }}>Ingen viden matcher “{soeg}”.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
            {synlige.map((v) => (
              <VidenKort
                key={v.id}
                viden={v}
                laast={laast}
                onLaes={() => setLaes(v)}
                onRediger={() => setForm({ viden: v })}
                onSlet={() => { setHandlingFejl(''); setSletKandidat(v) }}
              />
            ))}
          </div>
        )
      )}

      {form && <VidenForm viden={form.viden} onClose={() => setForm(null)} onSaved={gemt} />}
      {laes && <VidenLaes viden={laes} onClose={() => setLaes(null)} />}
      {sletKandidat && <SletDialog viden={sletKandidat} busy={sletBusy} fejl={handlingFejl} onBekraeft={slet} onClose={() => { setHandlingFejl(''); setSletKandidat(null) }} />}
    </div>
  )
}
