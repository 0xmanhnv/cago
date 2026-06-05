# 17 — Repository Structure

The actual repo layout (kept in sync with the running system). Product: **Cago** (Minh Tuyết shop).
The front end is **Next.js** under `web/`; the backend is the Frappe app **`cago`**.

```text
agrimate/
├── CLAUDE.md                     # instructions for Claude Code (architecture decisions, conventions)
├── README.md                     # overview + link to docs/00_INDEX.md
├── docs/                         # docs — see docs/00_INDEX.md (user / technical / archive)
│   ├── 00_INDEX.md  user/  archive/  ...
├── prompts/                      # project bootstrap prompts (historical)
├── data/                         # original sample data / specs
├── scripts/                      # CLI helpers: import_products, backup.sh, restore.sh, export_fixtures
│
├── web/                          # ❖ FRONTEND — Next.js 16 (App Router, TS, Tailwind), public entry
│   ├── next.config.mjs           #   proxies /api,/app,/files,/assets,/socket.io → Frappe (one origin)
│   ├── public/  (PWA: sw.js, manifest)
│   └── src/
│       ├── app/                  #   routes: (kiosk)/  pos/  display/  login/  layout/providers/error
│       ├── components/           #   kiosk/ · staff/ · owner/ · pos/ · ui/ (+ CapabilityGuard, PwaRegister)
│       ├── lib/                  #   api.ts (frappeCall+CSRF), session, caps, types, utils(VND),
│       │                         #   kioskNav, cfd, useIsDesktop, offline/ (idb cache + queue + sync)
│       └── store/kiosk.ts        #   Zustand (kiosk cart, chat session, overlays)
│
├── frappe-apps/cago/             # ❖ BACKEND — custom Frappe app `cago` (API-first)
│   └── cago/
│       ├── api/                  #   28 whitelisted modules: sales, owner, staff, kiosk, debt,
│       │                         #   purchasing, supplier, reports, shift, cashbook, coupon,
│       │                         #   inventory, display, payment, verify, units, staff_admin… (see 39)
│       ├── chatbot/              #   orchestrator, retrieval, context, prompts, safety,
│       │                         #   deterministic (keyword fallback), providers/, config, schema
│       ├── utils/                #   dto.py (role-scoped DTOs), permissions, slug, safety…
│       ├── setup/                #   custom_fields, company, seed, sample_data, audit, backup, test_accounts
│       ├── cago/doctype/         #   DocTypes: cago_coupon, cago_till_shift, cago_wanted_list,
│       │                         #   cago_store_map (+zone/floor/aisle), cago_job_role, cago_chatbot_log…
│       ├── fixtures/             #   custom_field.json (core product fields), roles…
│       ├── patches/  patches.txt #   migrations
│       ├── tests/                #   FrappeTestCase suite (134 tests)
│       └── hooks.py              #   after_migrate → setup_all_fields, etc.
│
└── infra/docker/                 # ❖ DEPLOY — Docker Compose
    ├── compose.yaml              #   backend(gunicorn), websocket, scheduler, queue-short/long,
    │                             #   frontend(Frappe nginx, internal), web(Next.js, public), db, redis,
    │                             #   + profiles: tls(caddy) · backup
    ├── compose.override.dev.yaml #   dev override (NOT auto-loaded — rebuild backend for any cago change)
    ├── Dockerfile  Caddyfile  preflight.sh
    └── .env.example / .env.production.example
```

## Flow rules
- **Public entry = `web` (Next.js, port 8080→3000)**; it proxies Frappe via `frontend` (Frappe's
  internal nginx). The backend is **API-first**: `web` calls `cago.api.*` (cookie session + CSRF).
- **A backend change (tests included) requires `docker compose build backend`** (the dev override
  isn't auto-loaded). Recreating backend → restart `frontend` + `web` (nginx caches the old upstream IP → 502).
- DTOs are role-filtered in `utils/dto.py` (staff don't see cost/profit) — checked by `setup/audit.py`.

## Setup data — three separate layers
Canonical source: the docstring in `cago/setup/seed.py`.

1. **Migration (structural)** — runs on `bench migrate`/install:
   - Custom fields: `hooks.after_migrate` → `cago.setup.custom_fields.setup_all_fields`.
   - DocTypes + roles: `hooks.fixtures` (`fixtures/custom_field.json`…).
   - Data patches: `patches.txt` (cap-roles, default job-role assignment…).
   → Changes the **SHAPE** of the DB, not business records.

2. **MANDATORY seed** — `cago.setup.seed.seed_baseline` (idempotent), run at site creation for **both
   dev and production**: Company + accounts + POS Profile + payment modes · price lists (Standard
   Selling, Giá sỉ) · category tree + icons/colours · default Cago Job Roles. → Without these the app can't work.

3. **OPTIONAL / demo seed** — `cago.setup.sample_data.import_sample_products` (54 demo products + demo
   batches/stock), gated by `LOAD_SAMPLE_DATA`. Production starts **empty** and imports the real catalog
   via CSV (`import_catalog`). Never required.

> `create-site` (compose): new-site → **seed_baseline (always)** → demo (only when `LOAD_SAMPLE_DATA=1`).

---

See also: [27](27_FRONTEND_MIGRATION_NEXTJS.md) (why Next.js), [39](39_API_REFERENCE.md) (API),
[40](40_FRONTEND_DEV_GUIDE.md) (`web/` dev), [42](42_CAI_DAT.md) (install), [38](38_GO_LIVE_RUNBOOK.md) (deploy).
