# AgriMate — Docker setup

Full ERPNext **v16** stack with the `cago` app baked into a custom image.
Based on the official `frappe_docker` topology (separate backend / frontend /
websocket / scheduler / workers / db / redis).

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Builds `cago/erpnext:v16` = ERPNext v16 + `cago`. |
| `compose.yaml` | The full production-like stack. |
| `compose.override.dev.yaml` | Live-mounts local app source for development. |
| `.env.example` | Copy to `.env`; passwords, ports, site name, image tags. |

## Quick start

```bash
cd infra/docker
cp .env.example .env          # edit ADMIN_PASSWORD, DB_ROOT_PASSWORD, etc.
docker compose build          # build the custom image
docker compose up -d          # start; create-site runs once, then exits
docker compose logs -f create-site   # watch site creation finish
```

Open <http://localhost:8080> → log in as `Administrator` / `ADMIN_PASSWORD`.

`create-site` is idempotent: it skips creation if the site already exists, so
`up`/`down` cycles are safe (data lives in named volumes).

## Common operations

```bash
# bench inside the running stack
docker compose exec backend bench --site agrimate.localhost migrate
docker compose exec backend bench --site agrimate.localhost console

# import sample products (Milestone 1)
docker compose exec backend \
  bench --site agrimate.localhost execute \
  cago.setup.sample_data.import_sample_products

# backup / restore
docker compose exec backend bench --site agrimate.localhost backup --with-files
```

## Development (live code reload)

```bash
docker compose -f compose.yaml -f compose.override.dev.yaml up -d --build
# after editing DocTypes/hooks:
docker compose exec backend bench --site agrimate.localhost migrate
docker compose restart backend scheduler queue-short queue-long websocket
```

## Notes & gotchas

- **ERPNext v16 base image:** set `ERPNEXT_VERSION` in `.env` to a published v16 tag
  (`version-16` or a pinned `v16.x.x`). If no v16 image exists yet, use `develop`
  temporarily — but the target platform is v16.
- **The POS is Cago-native (`/pos/sell`).** No external POS app is installed; ERPNext
  native POS/Sales Invoice stays only as a back-end data fallback.
- **Production hardening (later):** put HTTPS/reverse-proxy in front (Traefik or
  nginx), pin image digests, move secrets out of `.env` into a secret store, and
  schedule the `scripts/backup.sh` job offsite (see `docs/19_DEPLOYMENT_PLAN.md`).
