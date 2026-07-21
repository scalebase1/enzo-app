# Enzo edge-funktion — ændringer der SKAL laves i backend

Disse ændringer hører til edge-funktionen `enzo-chat` (`supabase/functions/enzo-chat/index.ts`
i Supabase). Den findes **ikke** i dette repo, og jeg havde hverken Supabase-MCP eller
supabase-CLI i denne session — derfor kan jeg ikke deploye dem. Christopher indsætter dem
i den nuværende `index.ts`. Frontend-delen (forslag som knapper i chatten) er lavet og merget.

Alt herunder er formuleret som **tilføjelser til den eksisterende `index.ts`** — ikke en
fuld omskrivning, da funktionen er blevet ændret (kontekst trimmet) siden jeg sidst så den.

---

## 1a + 1d — registrér `enzo_status` som værktøj

Tilføj til `TOOLS`-arrayet:

```ts
{
  type: "function",
  function: {
    name: "hent_status",
    description:
      "Williams status-overblik: hvad kræver handling lige nu. Brug DETTE " +
      "vaerktoej — ikke hent_bookinger/hent_kontekst — naar William spoerger til " +
      "status, hvad han mangler, hvad han skal se paa, hvad der haster, eller " +
      "lignende. Read-only. Send ingen parametre.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
},
```

Og til `RPC_FOR_TOOL`:

```ts
hent_status: "enzo_status",
```

`enzo_status()` returnerer ~2.000 tegn mod `hent_kontekst`'s ~6.700 og er hurtigere —
det er dermed også en del af timeout-fixet (1d): status-spørgsmål behøver ikke den fulde
kontekst.

**Timeout (1d) i øvrigt:** frontendens `AbortController` afbryder efter **30 s**
(`src/sections/Enzo.jsx` og `Forside.jsx`). Det er en løftestang hvis edge-funktionen
selv har en kortere grænse. Jeg hævede den ikke — den rette værdi er et backend-kald,
og en for høj frontend-timeout maskerer bare en langsom backend. Tjek om `enzo-chat`'s
egen fetch mod OpenAI har en timeout der kan hæves.

---

## 1a + 1b — systemprompt: status-adfærd

Tilføj til systemprompten:

```
STATUS-SPØRGSMÅL: Når William spørger til status, hvad han mangler, hvad han skal se
på, hvad der haster, eller lignende — kald hent_status FØRST. Gengiv ALLE punkter fra
svaret. Du må ALDRIG udelade, sammenlægge eller vælge blandt dem: William har selv
bedt om overblikket, og et punkt du springer over, er et han ikke får handlet på.
Rækkefølgen i svaret er allerede prioriteret — bevar den, og start med det der haster.

OPSÆTNING af status-svar (og lange svar generelt): skriv overskueligt, ikke løbende
prosa. Brug denne struktur pr. punkt:
  **Overskrift** (fx "4 ubesvarede henvendelser")
  kort forklaring på én linje under (navne, dage, hvad kunden spurgte om)
  → Handling: den konkrete næste handling, tydeligt adskilt
Gruppér efter hastighed med en kort overskrift for hver gruppe (fx "Haster nu",
"Snart", "Kan vente"). Vis antal_punkter, og sig det ærligt hvis alt_ok er true
("Der er ikke noget der kræver din handling lige nu.").
```

---

## 1c-a — systemprompt: altid forslag, aldrig spørg i tekst

Erstat/skærp afsnittet om forslag, så Enzo **aldrig** beder om lov i tekst:

```
HANDLINGER = ALTID ET FORSLAG. For ENHVER handling der ændrer eller sender noget:
opret straks et forslag via opret_forslag. Spørg ALDRIG i teksten "vil du have at
jeg…" eller "skal jeg oprette…". Forslaget ER spørgsmålet — William godkender eller
afviser det med en knap i chatten. Har du alt hvad du skal bruge, så opret forslaget
med det samme og sig kort at det ligger klar til godkendelse. Kun hvis der MANGLER en
oplysning du ikke kan slå op, stiller du ét kort spørgsmål i stedet.
```

Dette er **halvdelen** af 1c. Den anden halvdel — at forslag vises som knapper i selve
chatten — er lavet i frontenden (`Enzo.jsx`) og merget: afventende forslag renderes nu
inline i chatstrømmen med Godkend/Afvis, ud over sidepanelet.

---

## Verifikation efter deploy

1. Spørg Enzo "Er der noget jeg skal være opmærksom på lige nu?" → hun skal kalde
   `hent_status`, gengive **alle** punkter grupperet efter hastighed, og starte med
   det der haster.
2. Bed Enzo om noget der ændrer data → hun skal oprette et forslag (knap i chatten),
   ikke spørge i tekst.
3. Mål svartiden på status-spørgsmålet — den bør være hurtigere end før (mindre kontekst).
