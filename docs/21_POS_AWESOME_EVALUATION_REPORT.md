# 21 — POS Awesome Evaluation Report (Milestone 2)

**Date:** 2026-05-31 · **Target platform:** ERPNext v16 / Frappe v16
**Verdict: ⛔ DEFER — do NOT include POS Awesome in the v16 MVP. Ship on native ERPNext POS.**

This is the filled-in result of the worksheet in
`docs/20_POS_AWESOME_EVALUATION_NOTES.md`, following the criteria in
`prompts/POS_AWESOME_EVALUATION_PROMPT.md` and `docs/04_POS_STRATEGY.md`.

---

## 1. Summary

POS Awesome is a mature, popular Vue/Vuetify POS UI for ERPNext, but its published
releases target **ERPNext v12–v15**. As of the evaluation date there is **no
v16-compatible release or branch** from the upstream project or the active
community forks, and the Frappe Cloud marketplace listing states support for
**v12, v13, v14, v15** only (no v16).

Our architecture (CLAUDE.md, docs/04) explicitly forbids depending on POS Awesome
and mandates native POS as the fallback. **Gate #1 (a v16-compatible release
exists) fails**, so the remaining criteria cannot be assessed on the v16 target and
the MVP proceeds on native POS. This is a deferral, not a rejection of the product.

## 2. Checklist result

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | **v16-compatible release exists** | ❌ **FAIL (blocking)** | Upstream + forks ship v15 max; marketplace lists v12–v15 only. |
| 2 | Installs cleanly + reproducibly | ⏸ Not assessed on v16 | Installs fine on a **v15** stack (harness provided). |
| 3 | Works with a POS Profile | ⏸ Blocked by #1 | Known-good on v15. |
| 4 | Item image / card view | ⏸ Blocked by #1 | This is POS Awesome's main strength; assess on v15 if desired. |
| 5 | Search speed @ 500/2k/10k | ⏸ Blocked by #1 | Use `cago.setup.benchmark` to measure (see §5). |
| 6 | Barcode support | ⏸ Blocked by #1 | Supported on v15. |
| 7 | Touch / tablet usability | ⏸ Blocked by #1 | Strong on v15. |
| 8 | Offline / cache | ⏸ Blocked by #1 | Partial on v15. |
| 9 | Stock sync correctness | ⏸ Blocked by #1 | |
| 10 | Sales/POS Invoice correctness | ⏸ Blocked by #1 | |
| 11 | Payment methods | ⏸ Blocked by #1 | |
| 12 | Upgrade risk | ⚠️ **High** | Tracks ERPNext one major version behind; v16 support timing unknown. |
| 13 | Code quality / maintainability | ✅ Reasonable | Active forks; Vue/Vuetify frontend needs `bench build`. |
| 14 | Integrates w/o core mods | ✅ Likely | Installs as a standard app; no ERPNext core patching required. |
| 15 | Native POS still usable | ✅ Yes | Native POS is unaffected and is our chosen MVP path. |

## 3. Decision and rationale

- **MVP (v16):** use **native ERPNext POS**. It is the mandatory fallback per
  docs/04 and is fully supported on v16; v16 also improved the native POS item
  selector (list view with name/price/UOM/qty).
- **Do not** add POS Awesome to the production image (`infra/docker/Dockerfile`) or
  make any business flow depend on it. All product knowledge already lives in
  `cago`, satisfying docs/04 §4.
- **Re-evaluate** when a v16-compatible POS Awesome branch is published. The
  isolated harness below makes that a < 1 hour re-test.

## 4. How to re-run this evaluation (reproducible harness)

A fully isolated stack is provided so the evaluation never touches the pilot site:

- Build/run: `infra/docker/poseval/` (separate image, project name, site, port).
- It is parameterized by `ERPNEXT_VERSION`, `POSAWESOME_REPO`, `POSAWESOME_BRANCH`.
- Default config targets a **v15** stack (what installs today) so the UX/feature
  fit can be assessed now. Point it at a v16 branch when one exists to clear gate #1.

See `infra/docker/poseval/README.md` for commands.

## 5. Measuring search performance (criterion #5)

Search speed is platform-generic and also matters for the staff search screen
(Milestone 4), so the benchmark lives in the app:

```bash
# seed synthetic items, then time a typical search
docker compose exec backend bench --site <site> execute \
  cago.setup.benchmark.seed_items --kwargs "{'count': 10000}"
docker compose exec backend bench --site <site> execute \
  cago.setup.benchmark.benchmark_search --kwargs "{'term': 'cam', 'iterations': 20}"
docker compose exec backend bench --site <site> execute \
  cago.setup.benchmark.cleanup_benchmark_items
```

## 6. Fallback plan (active)

Native POS is the baseline. The staff screen (Milestone 4) shows an "Mở POS gốc"
button always, and an "Mở POS Awesome" button only if a passing POS Awesome
install is detected — keeping the system functional with POS Awesome absent.

## Sources

- POS Awesome — Frappe Cloud Marketplace (lists v12–v15): <https://cloud.frappe.io/marketplace/apps/posawesome>
- POS Awesome (ucraft-com fork): <https://github.com/ucraft-com/POS-Awesome>
- POS Awesome V15 forks: <https://github.com/wahni-green/POS-Awesome-V15>, <https://github.com/defendicon/POS-Awesome-V15>
- ERPNext v16.0.0 release: <https://github.com/frappe/erpnext/releases/tag/v16.0.0>
