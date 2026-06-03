# 28 — POS Awesome V15 → ERPNext/Frappe v16 Porting Strategy (Evaluation)

> 🗄 **LƯU TRỮ.** POS Awesome đã **gỡ hẳn**; không port/fork. POS hiện tại: Cago-native `/pos/sell` — [36](36_STAFF_MOBILE_POS_PLAN.md).

> **Status: EVALUATION ONLY — no code.** Builds on docs/04, docs/20, docs/21 (verdict
> there: *defer*). This document upgrades that into a concrete *porting* strategy if/when
> we decide to invest. Native ERPNext POS remains the mandatory fallback at all times.
>
> **Naming note:** the core app in this repo is **`cago`** (the brief said `cago_store`).
> The proposed fork name **`cago_posawesome`** is kept as requested. Cago business logic
> stays in `cago`; the fork holds only POS UI + a thin adapter.

---

## 0. What is and isn't measured here

Confirmed live from our running site:

| Item | Value (measured) |
|---|---|
| Frappe | **16.19.0** |
| ERPNext | **16.20.0** |
| cago | 0.1.0 |
| Node | **v24.12.0** (nvm) |
| Yarn | **1.22.22** |
| npm | 11.6.2 |
| Frappe asset pipeline | **esbuild** (`bench build`) — not webpack |
| Installed apps | `frappe`, `erpnext`, `cago` only |
| POS Awesome | **NOT installed** |

**Therefore section 1's runtime/console/build/server errors cannot be captured yet** —
POS Awesome has never been installed in this environment. Everything about POS Awesome's
*internal* stack (exact commit, Vue/Vuetify versions, build setup) must be **confirmed by
cloning upstream**; below it is marked `⚠️ CONFIRM`. The strategy is written so the first
work item is *capturing* this data, not assuming it.

---

## 1. Current compatibility status

- **ERPNext:** 16.20.0 · **Frappe:** 16.19.0 (measured).
- **POS Awesome commit/branch:** `⚠️ CONFIRM`. Upstream is the community app
  (`yrestom/POS-Awesome`, now community-maintained). The "V15" line targets ERPNext **v15**;
  marketplace/listing historically declares **v12–v15** only (per docs/21). There is **no
  declared v16 release** as of the docs/21 evaluation date (2026-05-31). The exact branch to
  fork is the highest-version branch that builds (likely `version-15` / `develop`).
- **Node/Yarn:** Node 24.12.0, Yarn 1.22.22 available in the bench container.
- **Browser console / server logs / build errors / runtime errors:** **not yet observable**
  (app not installed). Capture procedure in §6 and §7.

**Action to make §1 real:** in a throwaway v16 site, `bench get-app` the candidate branch,
`bench --site … install-app posawesome`, `bench build --app posawesome`, open the POS page,
and record: (a) `bench build` output, (b) `bench --site … console` import errors,
(c) browser devtools console + network 4xx/5xx, (d) `bench … logs` / gunicorn traceback on
invoice submit. Paste verbatim into docs/21's worksheet.

---

## 2. Root-cause categories (hypotheses + how to confirm)

POS Awesome is a self-contained Frappe app: a **Vue + Vuetify SPA bundled inside the app**
and mounted on a **Frappe Desk Page**, talking to **its own whitelisted Python API**
(`posawesome.posawesome.api.*`) which in turn calls **ERPNext selling/stock/accounts**
methods. The break points cluster into *build*, *page boot*, and *ERPNext API drift*.

| # | Category | Likely impact on v16 | How to confirm |
|---|---|---|---|
| A | **Vue 2 vs Vue 3** | ⚠️ CONFIRM which Vue the branch uses. POS Awesome **bundles its own Vue**, so it does NOT clash with Frappe's internal Vue 3. If the branch is Vue 2 it still *runs*; risk is only if it imported Frappe's Vue/global build helpers. | grep `package.json` deps for `vue`, `vuetify`. |
| B | **Vuetify mismatch** | Same as A — bundled, self-contained. Not a v16 blocker by itself. | `package.json`. |
| C | **Frappe asset build changes** | **HIGH likelihood of the real blocker.** Frappe v16 build = **esbuild** with specific `build.json`/`{app}/public` conventions and removed legacy webpack/rollup hooks. An app whose build assumed older Frappe bundling will fail `bench build`. | run `bench build --app posawesome`, read errors. |
| D | **Changed Desk/page boot APIs** | MEDIUM. Page registration, `frappe.pages[...].on_page_load`, `frappe.require`, asset URLs (`/assets/...`) and `frappe.boot` shape can drift v15→v16. | open page; console errors on mount. |
| E | **Changed ERPNext POS APIs** | **HIGH.** POS Awesome calls ERPNext whitelisted methods (item lookup, POS profile, pricing, make/submit invoice, payments). Signatures/paths change across majors. | network tab 404/417/500 on the `posawesome.api` + `erpnext.*` calls. |
| F | **Changed DocTypes/fields** | MEDIUM. POS Profile, Mode of Payment, Item Barcode, POS Invoice vs Sales Invoice field renames. | `bench … console` doc fetch; validation errors. |
| G | **Changed whitelisted methods** | MEDIUM-HIGH. Methods POS Awesome depends on may be renamed/guarded. | server 403/404 in logs. |
| H | **POS Profile behavior** | MEDIUM. v16 POS Profile defaults / required fields (we already had to set `write_off_account`, `cost_center`, payment mode in `cago.setup.company`). | create profile; load POS. |
| I | **Sales Invoice / POS Invoice behavior** | **HIGH.** ERPNext has been consolidating "POS Invoice" → "Sales Invoice (is_pos)". If the branch writes the legacy POS Invoice doctype, submit will break or mis-post. | submit a sale; inspect GL + Stock Ledger. |
| J | **Stock / payment APIs** | MEDIUM-HIGH. `update_stock`, batch/serial, payment entry creation paths. | submit; check Stock Ledger + Payment. |
| K | **Dependency/node/yarn mismatch** | LOW-MEDIUM. Node 24 + Yarn 1 vs the app's lockfile; native deps. | `yarn install` / build output. |

The **decisive blockers are C (build pipeline), E/G (ERPNext API drift) and I/J (invoice/stock/payment posting)** — not Vue/Vuetify, which is bundled and self-contained.

---

## 3. Risk classification

| Issue | Class | Rationale |
|---|---|---|
| Vue 2/3 bundled SPA coexistence | **LOW** | Self-contained bundle; doesn't touch Frappe's Vue. |
| Vuetify version | **LOW** | Bundled. |
| Dependency/node/yarn | **LOW–MEDIUM** | Lockfile refresh / engine bump; mechanical. |
| Page registration / boot API | **MEDIUM** | Small JS/Python patches to page hooks + asset paths. |
| POS Profile query/fields | **MEDIUM** | Field/filter patches; we already handle profile setup in `cago`. |
| ERPNext whitelisted method drift | **MEDIUM–HIGH** | May need shims/adapters per changed method. |
| esbuild/build-config port | **MEDIUM–HIGH** | Re-target the app's build to Frappe v16 esbuild conventions. |
| Invoice/stock/payment posting correctness | **HIGH** | Money + inventory correctness; must be exhaustively tested. |
| Full Vue 2→3 + Vuetify 2→3 rewrite (only if branch is Vue 2 *and* we choose to modernize) | **STOPPER (if required)** | Multi-week UI rewrite; not justified for MVP. |
| Any change requiring ERPNext/Frappe **core** edits | **STOPPER** | Violates architecture rules. |

---

## 4. Fork strategy (if viable)

- **Repo:** `cago_posawesome` (separate repo / Frappe app), installed *optionally* alongside `cago`.
- **Upstream remote:** add upstream read-only:
  - `origin` → our fork (`github.com/0xmanhnv/cago_posawesome`)
  - `upstream` → the original POS Awesome repo (fetch-only)
- **Branches:**
  - `upstream-v15` — pristine mirror of the upstream branch we forked (never hand-edited; only `git fetch upstream && merge`/`reset`). This is the diff baseline.
  - `cago-v16-port` — active porting work; all v16 patches land here, each as a small, documented commit.
  - `cago-production` — release branch; only fast-forwarded from `cago-v16-port` after the §7 test matrix + §8 go-criteria pass. Deployments pin a tag here.
- **Patch documentation rules:**
  - Every v16 patch commit message starts with a tag: `[build]`, `[api]`, `[page]`, `[doctype]`, `[posprofile]`, `[invoice]`, `[deps]`, `[adapter]`.
  - Maintain `PORTING_NOTES.md` in the fork: one row per patch — *what upstream assumed, what v16 needs, the fix, the file(s)*.
  - Keep patches **minimal and localized**; never reformat untouched files (keeps upstream diffs reviewable).
- **Keep future upstream merges possible:**
  - Never edit `upstream-v15`. Rebase/merge `upstream-v15` into `cago-v16-port` when upstream releases v16 support, then drop now-redundant patches.
  - Prefer **additive shims** (new adapter modules) over in-place rewrites of upstream files where practical.
- **No Cago business logic in the fork:** the fork must not contain product advice, safety notes, alternatives, kiosk data, debt, pricing rules, or role policy. It may only *call* `cago` adapter endpoints (§5).

---

## 5. Compatibility adapter strategy (thin layer in `cago`)

A small, **owned-by-`cago`** adapter is the only coupling between the two apps.

- **Source of truth stays in `cago`/ERPNext.** POS Awesome reads display fields only.
- **New whitelisted read endpoint in `cago`** (e.g. `cago.api.pos_adapter.pos_items(profile)`)
  returns a POS-safe projection: `item_code, display_name, price_text/rate, uom, image,
  stock_status, is_chemical, barcode`. It reuses existing `cago.utils.dto` so field
  whitelisting and **sensitive-field exclusion** (no buying price / margin / valuation) are
  enforced in one place — the same guarantees the kiosk/staff DTOs already have.
- **POS Awesome must NOT own:** product advice, safety notes, alternatives, kiosk visibility,
  customer debt, or any owner-only data. Those never enter the fork; if POS needs to *show* a
  safety badge it requests the flag via the adapter (display-only).
- **Pricing & posting stay native.** The adapter does not reimplement invoicing; POS Awesome
  continues to submit through ERPNext's standard Sales Invoice (is_pos) path so accounting and
  stock remain ERPNext-native and identical to the fallback.
- **Fallback invariant:** disabling/uninstalling `cago_posawesome` must leave native ERPNext
  POS fully functional. The adapter endpoints are *additive*; nothing in `cago` may *depend* on
  the fork being present (mirrors the existing `has_posawesome` capability flag in
  `cago.api.session.bootstrap`, which already toggles the POS-Awesome button only when installed).

---

## 6. Minimal patch plan (smallest path to "loads on v16")

Strictly incremental — **do not start with a rewrite**. Stop at the first hard STOPPER.

1. **Capture baseline (no patching):** clone candidate branch into `upstream-v15`, `bench get-app`,
   attempt `install-app` + `bench build`. Record every error (§1 action). This decides everything.
2. **Dependencies/build (LOW→MED):** refresh lockfile for Node 24 / Yarn 1; re-point the app's
   asset build to Frappe v16 **esbuild** conventions (entry in `{app}/public/js`, `build.json` if
   used). Goal: `bench build --app posawesome` succeeds.
3. **Page registration/boot (MED):** fix Desk page hook + asset URLs so the SPA mounts without
   console errors. No business logic.
4. **API route fixes (MED):** for each failing call, repoint to the v16 ERPNext method or add a
   thin shim **inside the fork's Python api** (not in ERPNext). Catalogue each in `PORTING_NOTES.md`.
5. **POS Profile query fixes (MED):** align profile/payment-mode/warehouse field filters with v16.
6. **Invoice submission flow (HIGH — gated):** make one cash sale submit correctly; verify GL +
   Stock Ledger match a native-POS sale of the same item. Only proceed past here if correct.

After step 6 passes for cash, extend to payments/returns (§7). If steps 2–4 already require Vue/Vuetify
rewrites or ERPNext-core edits → **STOP** (§8).

---

## 7. Test plan

**Environment:** clean Frappe/ERPNext **v16** site · `cago` installed · `cago_posawesome` (fork)
installed · **native POS still enabled** · a POS Profile from `cago.setup.company`.

**Functional (POS Awesome):**
- [ ] POS page loads (no console/network errors)
- [ ] product search works · [ ] product image displays
- [ ] add item to cart · [ ] change quantity · [ ] apply discount (if supported)
- [ ] select customer
- [ ] cash payment · [ ] transfer/bank payment (if configured)
- [ ] submit invoice · [ ] **stock updates** (Stock Ledger) · [ ] **accounting entries correct** (GL)
- [ ] receipt print · [ ] return/cancel (if supported) · [ ] barcode scan (if supported)
- [ ] slow-network behavior · [ ] tablet/touch usability

**Correctness oracle:** for each of cash + bank, submit the *same* item via native POS and via the
fork; the GL entries and Stock Ledger Entries must be **equivalent**. Any divergence = HIGH defect.

**Regression (must stay green):**
- [ ] native ERPNext POS still works (with fork installed *and* with it disabled)
- [ ] `cago` owner UI works · [ ] staff search works · [ ] kiosk works
- [ ] **no private fields exposed** · [ ] **no import price/profit/margin** reaches staff/customer
      (re-run `cago.setup.audit.run_audit` → must stay 11/11)

---

## 8. Go / No-Go criteria

**Continue porting only if ALL hold:**
- POS page loads reliably after the minimal patch set.
- Sale → payment → **stock** → **accounting** are correct (match native-POS oracle).
- Patch set is small, localized, documented in `PORTING_NOTES.md`, and re-mergeable with upstream.
- Native POS fallback remains fully intact with the fork installed or removed.
- **Zero** ERPNext/Frappe core modifications required.

**Stop (defer / abandon) if ANY hold:**
- A full Vue 2→3 / Vuetify 2→3 rewrite is required to build on v16.
- Invoice/payment/stock posting is unreliable or diverges from native POS.
- Any fix needs ERPNext/Frappe **core** edits.
- The port introduces private-field/debt/margin exposure that the adapter can't contain.
- Maintenance burden (patch count, fragility vs upstream drift) is disproportionate to MVP value.

---

## 9. Alternative plan (if porting is too expensive)

- **Ship MVP on native ERPNext POS** (already the mandatory fallback; works on v16 today).
- Invest the saved effort in **`cago` staff experience**: faster product search, advice,
  alternatives, shelf location, safety badges (already built and richer than stock POS).
- Add a lightweight **"send to POS" helper** if feasible: from staff/kiosk selection, pre-fill a
  native POS cart or a draft Sales Invoice via a `cago` whitelisted method — small, owned by us,
  no fork. (Feasibility to be confirmed against v16 POS page APIs.)
- **Postpone** any custom/forked POS until the store proves it needs a faster checkout than native
  POS provides.

---

## 10. Final recommendation

**→ Port POS Awesome in parallel (spike on a throwaway site), but ship the MVP on native ERPNext POS.**

Rationale: the existing verdict (docs/21) — *no declared v16 release* — still stands, and the
decisive risks are build-pipeline (esbuild) + ERPNext invoice/stock/payment API drift, which are
exactly the things that can quietly corrupt money/inventory. Those are too risky to put on the MVP
critical path. But the fork is *architecturally* clean (self-contained SPA + thin adapter, native
fallback intact), so a **time-boxed spike** (execute §6 steps 1–6 only) is worthwhile to get real
data and a maintainability read.

Concretely:
1. Time-box a spike (e.g. 2–3 days) running §6 steps 1–6 on a disposable v16 site.
2. Fill docs/21 worksheet with the *real* errors from §1.
3. Apply §8 go/no-go.
4. If go → continue on `cago-v16-port`, keep native POS as fallback for MVP, promote to
   `cago-production` only after §7 passes. If no-go → §9 (native POS + better `cago` staff UI).

**Do not** make `cago` depend on the fork, **do not** modify ERPNext/Frappe core, **do not** put
Cago business logic in the fork. No Go.

---

*Awaiting approval before any porting code. This document is evaluation/strategy only.*
