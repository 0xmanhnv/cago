# 20 — POS Awesome V15 Evaluation Notes (preparation)

> Status: **PREPARATION ONLY.** No POS Awesome code is installed or depended on in
> Milestone 0/1. This file is the worksheet for the Milestone 2 evaluation. Native
> ERPNext POS remains the mandatory fallback at all times.

## Target platform

- ERPNext **v16** / Frappe **v16** (see `CLAUDE.md`).
- ⚠️ "POS Awesome **V15**" is the app's own version line and is built for ERPNext
  **v15**. The **first and biggest open question** is whether a v16-compatible
  branch/release of POS Awesome exists and installs cleanly. Confirm this before
  spending time on the rest of the checklist. If no v16-ready release exists,
  the verdict is **defer** and we ship MVP on native POS.

## Rules (from docs/04 and docs/12)

- Do not make the system depend on POS Awesome.
- Do not store core product knowledge only in POS Awesome.
- Do not patch POS Awesome core unless documented, minimal, and reversible.
- Native POS must keep working with POS Awesome installed AND after uninstall.

## Evaluation environment

- Use a **throwaway dev site/branch**, never the pilot site.
- Take a `bench backup --with-files` before installing.

## Checklist (fill during Milestone 2)

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | v16-compatible release exists | ☐ | blocking gate |
| 2 | Installs cleanly + reproducibly | ☐ | |
| 3 | Works with a POS Profile | ☐ | |
| 4 | Item image / card view acceptable | ☐ | |
| 5 | Search speed @ 500 / 2k / 10k items | ☐ | |
| 6 | Barcode support (if needed) | ☐ | |
| 7 | Touch / tablet usability | ☐ | |
| 8 | Offline / cache behaviour | ☐ | |
| 9 | Stock sync correctness | ☐ | |
| 10 | Sales/POS Invoice correctness | ☐ | |
| 11 | Payment methods correct | ☐ | |
| 12 | Upgrade risk | ☐ | |
| 13 | Code quality / maintainability | ☐ | |
| 14 | Integrates with cago w/o core mods | ☐ | |
| 15 | Native POS still usable as fallback | ☐ | must stay ✔ |

## Deliverable (end of Milestone 2)

- Pass / Fail / Defer recommendation.
- Issues found + required config/patches.
- Fallback plan confirmation.
- Decision: use POS Awesome in MVP, or only after MVP.
