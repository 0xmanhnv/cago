# 27 — Frontend migration to Next.js (decoupled)

Owner-approved 2026-05-31. The UI moved from Frappe-native `www/` pages to a decoupled
**Next.js 16** app under `web/`. The Frappe backend was already **API-first**, so this
is a presentation-layer rewrite — no business logic or data changes.

## Architecture
```
Browser ─(one origin, :8080)→ web (Next.js :3000)
                                 ├ renders kiosk / owner / staff / login (+ PWA)
                                 └ rewrites proxy → frontend (Frappe nginx :8080) → backend (gunicorn)
                                   /api/*  /app/*  /files/*  /private/*  /assets/*  /socket.io/*
```
- **Auth = cookie session.** Login POSTs `/api/method/login` (phone or account). The SPA
  fetches `cago.api.session.bootstrap` once for `{user, roles, csrf_token, persona, brand,
  kiosk_chips, has_posawesome}`. CSRF token is sent on every write. Role list is for UI
  gating only — every owner/staff API still enforces `ensure_owner/ensure_staff` server-side.
- **Rewrites are baked at build time** (Next limitation): `FRAPPE_INTERNAL_URL` defaults to
  `http://frontend:8080` (the compose service). Override at *build* for non-docker dev.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui (Radix) ·
TanStack Query · Zustand · PWA (manifest + `sw.js` read-cache for the kiosk).

## Layout (`web/src`)
- `lib/api.ts` — `frappeCall` (cookie + CSRF, returns `.message`), `login`, `logout`, `uploadFile`.
- `lib/session.tsx` — SessionProvider (bootstrap + CSRF), `useSession`, `hasRole`.
- `lib/roles.ts` — role sets (plain module so server pages can import safely).
- `app/` — `(/)` kiosk, `/login`, `/owner`, `/staff` (owner/staff are `force-dynamic`, guarded by `RoleGuard`).
- `components/kiosk/*` — KioskApp, Assistant (context-aware chat), FloatingFab (draggable).
- `components/owner/OwnerApp.tsx`, `components/staff/StaffApp.tsx`.

## Run (single docker compose)
```bash
cd infra/docker
docker compose build           # builds Frappe+cago image and web image
docker compose up -d           # web is the public entry on :8080
```
The Frappe `frontend` is internal; uncomment its `ports` to expose Frappe directly for debugging.

## Notes / follow-ups
- PWA is installable + read-caches the kiosk; full offline-write + sync is a later phase.
- Manifest has no PNG icons yet (add for richer install).
- Frappe `www/` pages kept as internal fallback; remove once Next.js is proven in production.
