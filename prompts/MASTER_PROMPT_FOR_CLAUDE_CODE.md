# MASTER PROMPT FOR CLAUDE CODE

You are working on an ERPNext v16/Frappe project for a rural Vietnamese agricultural supplies store.

Read `CLAUDE.md` and all files under `docs/` first.

Important architecture:

- Core backend: ERPNext/Frappe.
- Core custom app: `cago`.
- POS: evaluate POS Awesome V15 as preferred POS UI, but keep ERPNext native POS as mandatory fallback.
- Auxiliary services: Python only, no Go.
- Do not modify ERPNext core.
- Do not put core business logic only in POS Awesome.

Your first output must include:

1. Architecture summary.
2. Proposed repo structure.
3. Proposed `cago` Frappe app structure.
4. Proposed Python services structure if needed.
5. POS Awesome V15 evaluation plan.
6. Milestone 1 implementation plan.
7. Test plan.
8. Risks and assumptions.

Do not code until this plan is produced.


Frontend rules:
- MVP must use Frappe-native pages/Jinja/Vanilla JS/simple CSS.
- Do not introduce Next.js/React/Radix/shadcn in MVP.
- Phase 2 standalone kiosk may use Next.js + React + TypeScript + Tailwind + Radix/shadcn.
- Use Python only for auxiliary services; no Go.

Your first output must also identify exactly which UI screens are MVP Frappe-native and which are optional Phase 2 standalone frontend screens.
