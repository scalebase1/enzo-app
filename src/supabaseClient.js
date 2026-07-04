import { createClient } from '@supabase/supabase-js'

// DEFAULT config paa aegte origin — bevist i Fase 0.
// Ingen storage-override, ingen window-eksponering, ingen fragment-fangst, ingen null-CORS.
const SUPABASE_URL = 'https://vakumjnnmfyqkcoxqcra.supabase.co'
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZha3Vtam5ubWZ5cWtjb3hxY3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDYwMTQsImV4cCI6MjA5NzI4MjAxNH0.uuQo0LEy6yDzkLIMg-vEhyevAbvaVCGPCh569h0SzFk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
