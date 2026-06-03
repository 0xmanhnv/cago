# 42 — Installation (from a bare machine to a running system)

Install Cago with Docker. Cago = ERPNext v16 (backend) + the `cago` app + Next.js (`web/`), all
packaged in Docker Compose under `infra/docker/`. Per-service technical detail: `infra/docker/README.md`.

> For a REAL deployment (domain, HTTPS, password change, backups, device QA) see
> [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md).

## 1. Requirements
- Server: an **in-store mini-PC** or a **VPS**. Minimum ~**4 GB RAM, 2 CPU, 20 GB disk** (8 GB RAM comfortable).
- OS: Linux (Ubuntu/Debian recommended). macOS/Windows work for dev.
- **Docker + Docker Compose v2**. Check: `docker --version` and `docker compose version`.
  - Quick install on Ubuntu: `curl -fsSL https://get.docker.com | sh` (then `sudo usermod -aG docker $USER`, log out/in).

## 2. Get the code
```bash
git clone <repo-url> cago && cd cago/infra/docker
```

## 3. Configure `.env`
- **Trying it out (dev, with sample data):**
  ```bash
  cp .env.example .env
  ```
- **Real deployment (production, empty catalog):**
  ```bash
  cp .env.production.example .env
  ```
  Edit `.env`: set `ADMIN_PASSWORD`, `DB_ROOT_PASSWORD` (strong, distinct), `SITE_DOMAIN` (if you have a domain).
  Keep `LOAD_SAMPLE_DATA=0` so no demo products are seeded.

## 4. Build & start
```bash
docker compose build                 # build the image (ERPNext + cago + web). Slow the first time.
docker compose up -d                 # start; the create-site service initialises the site once
docker compose logs -f create-site   # watch until site creation finishes, then Ctrl-C
```
`create-site` (runs once, idempotent): creates the site → **seed_baseline** (company, price lists,
categories, job roles) → seeds demo products only if `LOAD_SAMPLE_DATA=1`. `up`/`down` cycles are
safe (data lives in named volumes).

## 5. Access & login
- Browser: **`http://<server-ip>:8080`** (e.g. `http://192.168.1.10:8080`).
- ERPNext admin: `Administrator` / `ADMIN_PASSWORD`.
- Owner/staff: create accounts in **Store Settings → 👥 Nhân viên & quyền** (see [user/](user/)).

## 6. Load the real catalog + stock
```bash
docker compose exec backend python /home/frappe/frappe-bench/apps/cago/scripts/import_products.py \
  --site <site> --csv /path/to/catalog.csv
```
Or follow [user/NHAP_DU_LIEU_CSV.md](user/NHAP_DU_LIEU_CSV.md) (a ready `user/catalog_minh_tuyet.csv` is provided).
Import does **not** create stock — enter quantities via the **📥 Nhập hàng** (Receive) screen.

## 7. Common operations
```bash
docker compose ps                                       # service status
docker compose logs -f backend                          # backend logs
docker compose exec backend bench --site <site> migrate # run migrations
docker compose exec backend bench --site <site> console # python console
docker compose restart frontend web                     # after recreating backend (avoids 502)
```

## 8. Upgrade (deploy new code)
```bash
git pull
docker compose build backend web
docker compose up -d
docker compose exec backend bench --site <site> migrate
docker compose restart frontend web
```
> Any backend change (tests included) **requires rebuilding backend** (the dev override isn't loaded
> by default). Recreating backend → **restart `frontend` + `web`** (the Frappe nginx caches the old
> upstream IP → 502 otherwise).

## 9. Backup & restore
- Enable automatic backups: `docker compose --profile backup up -d backup` (see [38](38_GO_LIVE_RUNBOOK.md) §B).
- In-app: **Store Settings → 💾 Sao lưu dữ liệu**. Restore / rollback: [33_OPERATIONS_RESTORE_ROLLBACK.md](33_OPERATIONS_RESTORE_ROLLBACK.md).

## 10. Stop / restart
```bash
docker compose stop      # stop (keeps data)
docker compose up -d      # start again
docker compose down       # remove containers (data stays in volumes)
# docker compose down -v  # !! also DELETES data (volumes) — only to start completely fresh
```

---
Next, to run safely in production: **[38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md)** (Caddy HTTPS,
password change, offsite backup, printer/scanner/offline QA).
Project layout & the 3 data layers: **[17_REPO_STRUCTURE.md](17_REPO_STRUCTURE.md)**.
