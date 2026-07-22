import { useEffect, useRef } from 'react'

// Genindlaes naar brugeren vender tilbage til fanen.
//
// HVORFOR: Casa Food har tre chefer med samme adgang. Godkender William en
// booking kl. 10.00, ser chef nr. 2 den stadig som "ny" indtil han selv
// opdaterer siden. Backend afviser handlingen korrekt ("Bookingen er allerede
// behandlet"), saa der sker ingen skade — men chefen sidder med en skaerm der
// lyver, og en fejlbesked han ikke forstaar.
//
// Det her er den billige 90 %-loesning: naar man skifter tilbage til fanen,
// hentes data igen. Aegte realtid (Supabase Realtime) er den fulde loesning,
// men i praksis skifter man fane eller vindue foer man handler.
//
// TO HAENDELSER, ikke én: 'visibilitychange' fanger faneskift i samme vindue,
// 'focus' fanger skift mellem vinduer og programmer. Begge er noedvendige.
//
// MIN_INTERVAL beskytter mod at et hurtigt klik-frem-og-tilbage udloeser en
// byge af kald. 8 sekunder er langt nok til at daempe stoej, kort nok til at
// man aldrig opdager forsinkelsen.
export function useGenindlaes(load, { minInterval = 8000 } = {}) {
  const sidst = useRef(Date.now())

  useEffect(() => {
    if (typeof load !== 'function') return undefined

    const maaskeGenindlaes = () => {
      // 'focus' fyrer ogsaa naar fanen er skjult i baggrunden; uden dette tjek
      // ville vi hente data for faner ingen kigger paa.
      if (document.visibilityState !== 'visible') return
      const nu = Date.now()
      if (nu - sidst.current < minInterval) return
      sidst.current = nu
      load()
    }

    document.addEventListener('visibilitychange', maaskeGenindlaes)
    window.addEventListener('focus', maaskeGenindlaes)
    return () => {
      document.removeEventListener('visibilitychange', maaskeGenindlaes)
      window.removeEventListener('focus', maaskeGenindlaes)
    }
  }, [load, minInterval])
}
