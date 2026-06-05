# 40 — Frontend Dev Guide (`web/`)

For front-end developers. The app is **Next.js 16 (App Router, TypeScript)** in `web/`, the public
entry, proxying Frappe over a single origin (see [27](27_FRONTEND_MIGRATION_NEXTJS.md)).

## Run locally
```bash
cd web
npm install
npm run dev        # http://localhost:3000  (needs a running Frappe backend — see infra/docker)
npm run lint
npm run test       # vitest (caps.test, storemap.test, utils.test)
npm run build      # production build (typecheck + lint gate)
```
- `FRAPPE_INTERNAL_URL` (production, in-container) points at the internal Frappe nginx. Locally,
  Next rewrites/proxies to the backend (see `next.config.mjs`).
- The production build runs via Docker: `infra/docker` → image `cago/web` (see [38](38_GO_LIVE_RUNBOOK.md)).

## `src/` layout
- **`app/`** — routes (App Router):
  - `(kiosk)/` — customer: `/`, `/products`, `/cart`, `/assistant`, `/my-debt`, `/map`…
  - `pos/` — owner & staff: `/pos`, `/pos/sell`, `/pos/products`, `/pos/debt`, `/pos/backup`…
  - `display/` — customer-facing display (CFD); `login/`; `layout.tsx`, `providers.tsx`, `error.tsx`.
- **`components/`** — `kiosk/` · `staff/` · `owner/` · `pos/` · `ui/` (Sheet/dialog/toast/Skeleton/CategoryNav…).
- **`lib/`** — `api.ts` (Frappe calls + CSRF), `session.tsx` (bootstrap context), `caps.ts` (capability
  checks), `types.ts` (DTO types), `utils.ts` (VND helpers…), `kioskNav.ts`, `cfd.ts`, `useIsDesktop.ts`,
  `useLockBodyScroll.ts`, `offline/` (idb cache + queue + sync).
- **`store/kiosk.ts`** — Zustand store (kiosk cart, chat session, overlays).

## Conventions (read — settled over many iterations)
- **English identifiers**, Vietnamese only in UI text.
- **VND money:** always use `formatVnd/parseVnd/groupVnd` from `lib/utils`. Never `parseFloat` a
  grouped string ("1.000" → 1 is a bug).
- **API calls:** go through `frappeCall(...)` in `lib/api.ts` (auto CSRF). DTOs are already
  role-filtered — don't assume sensitive fields exist.
- **Hydration-safe:** do NOT read `sessionStorage`/`matchMedia` at module init (SSR mismatch → dead
  screen). Hydrate in a post-mount effect; see `useIsDesktop`, the `store/kiosk` hydrate, and the note
  in `KioskChrome`. Data screens must not throw on the empty/loading first render (guard `.length`).
- **Responsive:** touch-first (mobile/tablet); only widen + go multi-column on large screens (`xl:`).
  Forms keep a narrow column (`max-w`).
- **Offline (Sell screen):** `lib/offline/*` — caches catalog/customers (idb), queues orders, auto-syncs;
  `client_uuid` for idempotency. Cash + credit only while offline.
- **Capability:** `hasCap(boot, cap)` decides whether to show a control; the server still enforces —
  don't rely on a hidden UI for security.
- **Copyright header:** 0xManhnv; comments must not mention Claude/CLAUDE.md.

## Deploy
Change front-end code → `docker compose build web` → `up -d web frontend`. When the backend is
recreated, **restart `frontend` + `web`** (the Frappe nginx caches the old upstream IP → 502). See
[38](38_GO_LIVE_RUNBOOK.md) + [33](33_OPERATIONS_RESTORE_ROLLBACK.md).
