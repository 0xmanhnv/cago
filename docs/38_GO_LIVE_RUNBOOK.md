# 38 — Go-Live Runbook (hardening, backup, device QA)

Goal: take Cago from "runs on dev" to **safe real-world operation** for a rural shop. Do the steps
in order. Commands run from `infra/docker/`.

> Context: one small in-store server (mini-PC), a few tablets/phones + a 58 mm thermal printer + a
> barcode scanner on the same LAN. The owner is not tech-savvy. UI labels are quoted in Vietnamese.

---

## 0. Production deploy (with a domain/IP) — summary

```bash
cd infra/docker
cp .env.production.example .env          # fill in: ADMIN_PASSWORD, DB_ROOT_PASSWORD, SITE_DOMAIN...
# (LOAD_SAMPLE_DATA=0 → the site starts CLEAN, no demo products; import the real catalog via CSV)
bash preflight.sh                        # all "blockers" must be clear before continuing
docker compose build backend web
docker compose --profile tls --profile backup up -d
```

**HTTPS = Caddy (chosen — see §A3).** Set `SITE_DOMAIN` in `.env`:
- **With a domain** (e.g. `cago.minhtuyet.vn`) pointing an A-record at the server IP + ports **80 & 443**
  open → Caddy **auto-obtains a real Let's Encrypt cert**, auto-renews, **nothing to install on devices** (best).
- **Bare public IP only** → Caddy serves an internal cert; install Caddy's root CA on each device once
  (`docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt` → install on tablets/phones).

After enabling Caddy, set `HTTP_PUBLISH_BIND=127.0.0.1` so the plain-HTTP port 8080 is **not exposed
to the network** — everyone connects via `https://<domain>` (Caddy on 443).

`preflight.sh` quickly checks: default passwords, TLS, exposed HTTP port, offsite backup, compose validity.

---

## A. Security before go-live (mandatory)

1. **Change the default Administrator password.** `infra/docker/.env` ships
   `ADMIN_PASSWORD=change-me-admin`. Set a strong one, then change it on the running site too:
   ```bash
   docker compose exec backend bench --site agrimate.localhost set-admin-password '<NEW_PASSWORD>'
   ```
   Administrator is for admin only; owner/staff log in with their own accounts (see "👥 Nhân viên & quyền").

2. **Change all infrastructure passwords** in `.env` (DB, etc.) away from the sample values.

3. **HTTPS (chosen: Caddy).** `http://` shows "Not Secure" and limits clipboard/camera. The project
   ships a **`caddy`** service (profile `tls`) in front of `web`:
   ```bash
   docker compose --profile tls up -d caddy
   ```
   Configured via `SITE_DOMAIN` (see §0). Why Caddy (not nginx): on a single in-store box the hard
   part is the **certificate lifecycle** — Caddy obtains/renews automatically (Let's Encrypt with a
   domain) or issues an internal cert, set-and-forget; nginx would need manual cert creation + renewal.
   Frappe's internal nginx (the `frontend` service) is **unchanged** — Caddy only wraps HTTPS on the outside.

4. **Do not expose to the Internet.** Cago is designed for the LAN. For remote access use a VPN, do
   NOT port-forward directly.

5. **Lock down by role.** One account per staff member; enable only the needed capabilities (cost/
   profit/margin are hidden from staff — enforced and audited). See "👥 Nhân viên & quyền".

---

## B. Backup & restore (mandatory — this is the shop's money + receivables)

**Enable automatic backups** (opt-in, doesn't affect the normal stack):
```bash
docker compose --profile backup up -d backup
```
- Defaults: every 24h (`BACKUP_INTERVAL`), keep 14 days (`BACKUP_KEEP_DAYS`).
- Backups are written to `infra/docker/backups/offsite/` (DB + files).
- **True off-machine:** repoint `./backups/offsite` (the `x-bench-volumes-offsite` anchor in
  `compose.yaml`) to a **USB drive / NAS / Google-Drive-synced folder** so a copy lives off the box.
  Losing the server with backups only on that server = total loss.

**Back up now** (before an upgrade / big change):
- **In-app (recommended for the owner):** Store Settings → **💾 Sao lưu dữ liệu** → "Sao lưu ngay".
  Runs in the background, copies to `/offsite` if mounted — no command line.
- Or CLI:
  ```bash
  docker compose exec backend bench --site agrimate.localhost backup --with-files --backup-path /offsite
  ```

**Restore drill** (do it once to prove a backup is usable — details in docs/33): restore the latest
backup into a scratch site, verify receivables + a few invoices match. An untested backup is not a backup.

---

## C. On-device QA (hardware can't be exercised from CI — owner/technician runs this)

Open on the actual counter devices. Tick each item.

### C1. 58 mm thermal printer (receipts)
- [ ] Make one cash sale → enable "Tự in phiếu" → receipt prints at the correct 58 mm width, no overflow/clipping.
- [ ] Reprint via "🖨 In lại" → correct invoice.
- [ ] Vietnamese diacritics print correctly (no boxes/missing marks).

### C2. Barcode scanner
- [ ] On the Sell screen, scan a product with a barcode → it's added to the cart.
- [ ] On "Tra cứu" (lookup), scan → opens the right product.
- [ ] A code not in the system → "not found", no hang.

### C3. Offline selling (flaky network — high risk in rural areas)
- [ ] Open /pos/sell while ONLINE (to cache the catalog) → turn off wifi.
- [ ] The page still opens; search + picking an existing customer still work.
- [ ] Complete one cash sale + one credit sale → shows "PHIẾU TẠM — CHƯA ĐỒNG BỘ"; badge "Offline · 2 pending".
- [ ] Bank/QR + add-new-customer + coupon are locked while offline.
- [ ] Turn the network back ON → auto-sync → 2 real invoices appear, stock drops once per order, debt increases correctly.
- [ ] Tap checkout twice on a weak network → only one invoice (idempotency).

### C4. Customer-facing display (CFD) + kiosk
- [ ] Open "🖥 Màn hình phụ cho khách" on a second screen at the counter → cart + total mirror the sell screen; cost is NOT shown.
- [ ] Kiosk on the big in-store screen: categories/products fit; the map shows fully; the assistant opens as a corner chat window on PC, full-screen on tablet.
- [ ] Try on a customer phone: kiosk + assistant work, buttons large enough.

### C5. QR payment (VietQR)
- [ ] Configure the account under "💳 QR thu tiền" → a QR shows on collect-debt/sell; scanning with a banking app shows the right amount.

---

## D. Clean data before opening
- [ ] Open **🩺 Kiểm tra dữ liệu**: clear all "Thiếu giá" (missing price), merge "Có thể trùng" (duplicates), add images/categories.
- [ ] Flag **⭐ Hàng khuyên dùng** (recommended) for the items you want to push.
- [ ] Check **Sơ đồ cửa hàng** (store map) matches the real layout; enable "fixed kiosk" on the counter tablet.

---

## E. After go-live (recurring)
- Weekly: glance at 🩺 Kiểm tra dữ liệu + "Cảnh báo hôm nay" (low stock / near-expiry lots).
- Monthly: confirm the offsite backup folder has fresh copies; run a restore test once a quarter.
