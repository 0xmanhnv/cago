# 29 — POS Awesome v16 Port — Spike Milestone 1

> 🗄 **LƯU TRỮ.** Spike POS Awesome — đã **gỡ hẳn**. POS hiện tại: Cago-native `/pos/sell` — [36](36_STAFF_MOBILE_POS_PLAN.md).

> Companion to docs/28 (full porting strategy). **Owner-approved direction (2026-05-31):**
> *Port POS Awesome in parallel, but MVP/production ships on ERPNext native POS.*
> (The brief named this `docs/22`; that number is already `OWNER_TRAINING_VI`, so it lives at 29.)

## Decision
- **Do NOT fork to use now.** Fork only to **spike** (time-box ~2–3 days).
- **MVP stays on native ERPNext POS.** Track B (spike) must not slow Track A (Cago MVP).

## Two parallel tracks
```
Track A — Cago MVP:   ERPNext v16 + cago + native POS   → keep building the product.
Track B — POS spike:  fork/clone POS Awesome → try port on throwaway v16 site
                       → time-box 2–3 days → only decide next on REAL errors.
```

## Spike Milestone 1 — scope (evidence + first minimal patch only)
**Environment:** Frappe 16.19.0 · ERPNext 16.20.0 · cago 0.1.0 · Node v24.12.0 · Yarn 1.22.22 ·
npm 11.6.2 · installed apps: frappe, erpnext, cago.

**Hard constraints:** no ERPNext core edits · no Frappe core edits · no cago business-logic edits ·
no Vue/Vuetify rewrite · cago must not depend on POS Awesome · native POS untouched & working ·
work only on a disposable site / isolated branch · **stop after evidence + the first minimal patch
and report.**

**Tasks:** (1) identify upstream repo/branch/commit + declared compat + package.json deps;
(2) fork structure `cago_posawesome` with branches `upstream-v15`, `cago-v16-port`;
(3) attempt install on a throwaway v16 site (`get-app` → `install-app` → `bench build` → open POS);
(4) capture ALL real errors (install/build/python-import/server-log/browser-console/network 4xx-5xx/mount/whitelisted-method);
(5) classify each (LOW/MEDIUM/HIGH/STOPPER); (6) apply ONLY the first minimal patch if clearly
LOW/MEDIUM (deps pin, build config, asset path, import path, page hook) — **no** invoice/payment/stock
patch, **no** Vue/Vuetify rewrite, **no** core edits; (7) verify fallback (native POS + cago owner/staff/kiosk
still load; removing the fork doesn't break cago); (8) report.

## Continue / Stop rules (apply after Milestone 1)
**Continue** if the blockers are: build config · asset path · import path · page registration ·
dependency pin · a small whitelisted-method rename.
**Stop** if they require: a large Vue 2→3 migration · Vuetify rewrite · wrong invoice submit ·
wrong stock ledger · wrong GL entry · any ERPNext/Frappe core change.

## Report template (fill at end of Milestone 1)
- upstream repo / branch / commit · package.json dependency summary (Vue/Vuetify/build)
- install result · build result · runtime result · full error snippets
- first root-cause hypothesis · patches applied (files changed) · risk classification
- next minimal patch recommendation · continue-or-stop · rollback steps

---
### Results (Milestone 1)
_To be filled when the spike runs. Until then: native POS is the production POS._
