import { createClient } from '@supabase/supabase-js'

// DEFAULT config paa aegte origin — bevist i Fase 0. Ingen hacks.
const SUPABASE_URL = 'https://vakumjnnmfyqkcoxqcra.supabase.co'
export const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZha3Vtam5ubWZ5cWtjb3hxY3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDYwMTQsImV4cCI6MjA5NzI4MjAxNH0.uuQo0LEy6yDzkLIMg-vEhyevAbvaVCGPCh569h0SzFk'

// Laeser URL-typen FOER detectSessionInUrl rydder fragmentet. Ikke et hack:
// ren URL-laesning (docs-eksemplet goer det samme). supabase-js etablerer selv
// recovery/invite-sessionen; vi bruger kun typen til at vise saet-kode-skaermen.
export const authLandingType = (() => {
  try {
    const h = (window.location.hash || '').replace(/^#/, '')
    if (!h) return null
    const p = new URLSearchParams(h)
    const err = p.get('error_description') || p.get('error')
    if (err) return { error: err }
    const t = p.get('type')
    if ((t === 'recovery' || t === 'invite') && p.get('access_token')) return { type: t }
    return null
  } catch {
    return null
  }
})()

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
