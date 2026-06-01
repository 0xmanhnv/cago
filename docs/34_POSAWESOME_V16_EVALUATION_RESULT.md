# 34 — POS Awesome V15 on ERPNext/Frappe v16: Evaluation Result

**Date:** 2026-06-01
**Verdict:** **CONDITIONAL-GO** — usable directly as an *optional, owner-only* enhanced POS. No fork required for that scope. Native ERPNext POS and the Cago `/staff/sell` checkout remain the primary selling paths.

This evaluation was run on a **disposable bench** in throwaway containers (`paw-bench` / `paw-db` / `paw-redis` on the `paw-eval` network). The live `agrimate.localhost` stack was **never touched**. No Cago business logic, ERPNext core, or Frappe core was modified.

---

## 1. Repository verification (read-only)

| Item | Finding |
|---|---|
| Repo | `https://github.com/defendicon/POS-Awesome-V15` |
| Default branch | `develop` |
| Pin commit (evaluated) | **`c7e2b93e943ec7e9226f7c3ae9501b03e5f5d020`** — 2026-05-26, "Release: 15.30.0" |
| Frappe app name | `posawesome` (v15.30.0) |
| README support claim | "Vue.js and Vuetify (VERSION 15 and 16 Support)" |
| License | **GPL-3.0** |
| Python / build | `requires-python >=3.10`, flit_core; `frappe>=15`, `erpnext>=15` |
| Frontend | **Vue `^3.3.4`, Vuetify `^3.7.5`, Vite `^6.2.4`**, esbuild, TS 5.9, electron (desktop — irrelevant to web) |
| Integration surface | `doctype_js` (POS Profile / Sales Invoice / Company); `doc_events` (Sales Invoice, POS Invoice, Customer, Bin); `override_doctype_class` (POS Invoice, POS Invoice Merge Log); `after_migrate` = 11 patches; `after_uninstall` hook |
| UI route | desk page **`/app/posapp`** (Workspace "POS Awesome" → Page `posapp`); ships PWA `www/` (manifest, sw.js, offline.html) |

## 2. Test results (Frappe 16.19.0 / ERPNext 16.20.0 / Node 24.12)

| # | Test | Result |
|---|---|---|
| T1 | get-app + install-app | ✅ PASS — Python install clean. *Note:* prod image has no Node on PATH; the app's frontend deps need Node, installed via the image's bundled **nvm (Node 24)**. |
| T2 | `bench build --app posawesome` (Vite) | ✅ PASS — built in ~8s, assets emitted + copied |
| T3 | `bench migrate` (+ 11 `after_migrate` patches) | ✅ PASS — no errors |
| T4 | Page `/app/posapp` | ✅ server-side (desk 200, entry bundle 200, Page `posapp` registered). **Vue mount / white-screen requires a human browser.** |
| T5 | Functional POS flow (server-side, via `update_invoice`+`submit_invoice`) | ✅ PASS — a cash sale posted through POS Awesome's own API submitted a Sales Invoice (is_pos, paid, stock reduced). *Browser UI flow still recommended before go-live.* Note: POS Awesome's submit needs `company` + the payment-mode account resolvable from the POS Profile (the Vue UI supplies these; a minimal Cago POS Profile must have Mode-of-Payment accounts set). |
| T6 | Correctness vs native (GL/SLE/stock) | ✅ **MATCH** — same item via POS Awesome vs native is_pos Sales Invoice: both `docstatus=1, is_pos=1, grand=320000, outstanding=0, SLE=1, GL=4`. Identical posting. Confirms §3. |
| T7 | Native POS intact | ✅ PASS — POS Profile "AgriMate POS" + `point-of-sale` page present |
| T8 | Privacy / security | ⚠️ one real issue — see §4 |
| T9 | Cago integration | ✅ PASS — **all 76 Cago tests pass with posawesome installed**; no hook conflict; Cago code untouched |

posawesome's *own* test suite could not bootstrap (`DuplicateEntryError: Price List 'Standard Buying'`) — an erpnext test-fixture collision, **not** a product or v16 defect.

## 3. Why correctness is structurally safe (key finding)

`override_doctype_class` looked HIGH-risk pre-install. Reading it:

```
class CustomPOSInvoice(ERPNextPOSInvoice):
    def validate_pos_opening_entry(self):
        if self.posa_pos_opening_shift: validate_shift(self); return
        super().validate_pos_opening_entry()
```

It **only** adjusts POS *opening-shift* validation and calls `super()`. It does **not** override `make_gl_entries`, the stock ledger, `valuation_rate`, `on_submit`, or `on_cancel`. **All accounting and stock posting goes through native ERPNext.** → risk reclassified **HIGH → LOW/MEDIUM**. No STOPPER found.

## 4. The one real issue — cost leak (drives the "owner-only" condition)

`posawesome/posawesome/api/item_fetchers.py` (≈ lines 164, 528) appends **`valuation_rate`** (item cost) to the item payload with **no role gate** (confirmed: no `has_permission` / role check around it). So the POS item list ships **cost** to whoever loads the POS.

Per Cago rules, `valuation_rate` is **owner-only**. This is a leak **only if staff use POS Awesome**. Also one guest-whitelisted method exists: `m_pesa` (mobile-money webhook) — harmless if unused. No API keys/secrets found in the built bundles.

## 5. Decision & recommended path

**Use `posawesome` directly as an OPTIONAL, OWNER-scoped POS**, pinned to `c7e2b93`. No fork.

1. Gate POS Awesome to the **Owner** (the owner may see cost anyway). Staff continue on Cago's privacy-safe **`/staff/sell`** + native POS. → the cost leak never reaches staff.
2. **Native ERPNext POS** stays the mandatory fallback; **Cago never imports or depends on `posawesome`.**
3. **Only if** staff must use POS Awesome later → minimal fork **`cago_posawesome`** with one documented patch: role-gate/strip `valuation_rate` in `item_fetchers.py` (the two lines above) and optionally disable the `m_pesa` guest method.
4. **Before production:** complete the human browser test (T5/T6 UI) and a same-sale comparison vs native POS (Invoice + SLE + GL + stock).

GPL-3.0: running it beside MIT `cago` is fine; **never copy posawesome code into `cago`.** A fork would carry GPL — acceptable for an optional, separately-installed component.

## 6. Production install runbook (when approved) — pinned, owner-scoped

Run in the live bench (backend container). Native POS and Cago are unaffected; posawesome is installed per-site.

```bash
# 1) fetch + pin (Node must be on PATH — use the image's nvm if needed)
bench get-app --branch develop https://github.com/defendicon/POS-Awesome-V15
git -C apps/posawesome checkout c7e2b93e943ec7e9226f7c3ae9501b03e5f5d020
bench setup requirements

# 2) install on the AgriMate site only
bench --site <site> install-app posawesome
bench build --app posawesome
bench --site <site> migrate
bench restart   # or recreate the python services

# 3) scope to owner: in POS Profile used by POS Awesome, set
#    "Applicable for Users" = the owner user only (staff not enrolled).
```

## 7. Rollback / uninstall

- Evaluation infra (disposable): `docker rm -f paw-bench paw-db paw-redis && docker network rm paw-eval`
- Production uninstall (if needed): `bench --site <site> uninstall-app posawesome --yes` (runs `after_uninstall`) → `bench --site <site> migrate` → remove from `apps/` + `sites/apps.txt` → `bench build`.
- Cago + native POS require **no** rollback — neither is modified by installing posawesome.

## 8. Risk register

| Risk | Class | Mitigation |
|---|---|---|
| `valuation_rate` cost leak via item API | MEDIUM | Owner-scoped POS Profile; staff use Cago checkout; fork-patch if staff need it |
| 11 `after_migrate` patches mutate roles/settings | MEDIUM | Verified clean on v16; reversible via uninstall/site teardown |
| Self-contained Vite build needs Node + npm network | MEDIUM | Node 24 via image nvm; build verified |
| POS Invoice override (shift validation) | LOW | Calls `super()`; native posting untouched |
| `m_pesa` guest method | LOW | Unused; disable in a fork if desired |
| GPL-3.0 alongside MIT Cago | LOW | Keep separate app; never copy code into `cago` |
