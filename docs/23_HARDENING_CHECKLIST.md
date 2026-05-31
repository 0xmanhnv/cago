# 23 — Hardening & Go-Live Checklist (M10)

Run before piloting at the shop. Pairs with docs/12 (security) and docs/19 (deploy).

## Automated audit

```bash
docker compose exec backend bench --site <site> execute cago.setup.audit.run_audit
```

Must report all checks PASS (raises/non-zero on failure):
- `Cago Staff` / `Cago Kiosk` have **no raw Item read**.
- Staff & public DTOs carry **no sensitive keys** (valuation/buying/margin/cost).
- **Every chemical item** produces a safety warning.
- Owner-only whitelisted methods exist (price/debt/reports).

## Accounts & access

- [ ] Change all default passwords (`Administrator`, owner, staff) — `.env` values are placeholders.
- [ ] Owner user has role **Cago Owner**; cashiers have **Cago Staff** (+ ERPNext POS roles for native POS).
- [ ] No real user keeps **System Manager** except the technical admin.
- [ ] Kiosk tablet uses a browser kiosk session, **not** an admin login.

## API / data

- [ ] `GET /api/resource/Item/...` returns **403** for staff and guest.
- [ ] Guest can reach only `cago.api.kiosk.*`; staff/owner APIs return **403** to guests.
- [ ] Chemical products always show the standard safety warning in kiosk + chatbot.
- [ ] Chatbot refuses dosage/mixing questions and never invents price/stock.

## Backups (docs/14, docs/19)

- [ ] Daily DB + files backup scheduled (`scripts/backup.sh <site>`), stored offsite weekly.
- [ ] Monthly restore test (`scripts/restore.sh`).
- [ ] Pre-change backup before every migrate/upgrade.

## Deployment

- [ ] HTTPS / reverse proxy in front of the `frontend` service.
- [ ] Secrets in a real secret store, not committed `.env`.
- [ ] Company currency = **VND**; a **POS Profile** exists (auto-created by `ensure_company`).
- [ ] POS Awesome remains **not installed** until a v16 build exists (docs/21).

## Native POS sanity

- [ ] A native POS sale completes end-to-end (cash) on the POS Profile.
- [ ] Disabling/omitting POS Awesome does not break any screen.
