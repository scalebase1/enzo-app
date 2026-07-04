# Enzo — Casa Food driftssystem (Vite/React → Vercel)

Native app. Backend (Supabase + RPC'er + edge functions) uændret; kun frontend
serveres fra Vercel. Default Supabase-config — ingen n8n-hacks (bevist i Fase 0).

## Deploy-loop
Push til `main` → Vercel auto-deployer. (Denne mappe committes til
`scalebasevercel-arch/enzo-app`.)

## Lokalt
```bash
npm install
npm run dev      # udvikling
npm run build    # produktion -> dist/
```

## Faser
- **Fase 0 (grøn):** login + RPC + localStorage-persistering fra ægte origin.
- **Fase 1 (denne):** app-shell + sidebar-nav + rollebaseret auth. Overblik
  renderer ægte `dashboard_data`. Øvrige sektioner = placeholders.
- Senere: Medarbejdere (liste/ny/chat), Google-Calendar-grade kalender +
  auto-tildeling, mail-notifikationer, Enzo-assistent, Telegram helt ud.

## Roller (bekræftet mod DB)
- admin (William) → `er_admin()` = true → alle sektioner.
- medarbejder → `aktuel_medarbejder()` = staff-uuid → Kalender + Notifikationer.
- hverken/eller → "Ingen adgang".
