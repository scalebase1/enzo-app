# Enzo — Casa Food driftssystem (Vite/React → Vercel)

Native app. Backend (Supabase + RPC'er + edge functions) uændret; kun frontend
serveres fra Vercel. Default Supabase-config — ingen n8n-hacks (bevist i Fase 0).

Repo: scalebase1/enzo-app · Live: https://enzo-zeta.vercel.app
Push til main → Vercel auto-deployer.

## Lokalt
```bash
npm install
npm run dev
npm run build
```

## Faser
- Fase 0 (grøn): login + RPC + localStorage-persistering fra ægte origin.
- Fase 1 (grøn): app-shell + sidebar-nav + rollebaseret auth.
- **Fase 2 (denne):** Medarbejdere-sektion (liste via `medarbejdere_liste` +
  "Ny medarbejder" → `medarbejder-onboard` invite med redirectTo=origin) +
  glemt-kode 2. halvdel (recovery/invite-landing → sæt-kode-skærm → `updateUser`).
- Senere: kalender + auto-tildeling, mail-notifikationer, Enzo-assistent, Telegram ud.

## Roller (kilde-bekræftet)
- admin (William) → `er_admin()` = true → alle sektioner.
- medarbejder → `aktuel_medarbejder()` = staff-uuid → Kalender + Notifikationer.
