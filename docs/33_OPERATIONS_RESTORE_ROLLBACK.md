# 33 — Operations: Backup / Restore / Rollback runbook

> Practical runbook for the single‑store Docker deployment (`infra/docker`). Test the
> **restore** on a scratch copy at least once before relying on it.

## 1. What to back up
- **Database + files** (the site): products, prices, stock, customers, debt, settings, images.
- The **stack definition** (this git repo) + the built images (rebuildable from the repo).

## 2. Automated backup (already available)
`docker compose --profile backup up -d` runs a daily `bench backup --with-files` into
`sites/<site>/private/backups` (inside the `sites` volume). **Copy these offsite** (the volume is on
one machine):
```bash
cd infra/docker
# list backups
docker compose exec backend bash -lc 'ls -1 sites/$SITE_NAME/private/backups | tail'
# copy the newest DB + files tarballs to the host, then to offsite storage
docker compose cp backend:/home/frappe/frappe-bench/sites/agrimate.localhost/private/backups ./backups-$(date +%F)
```

## 3. Manual backup (before any risky change / upgrade)
```bash
cd infra/docker
docker compose exec backend bash -lc 'bench --site $SITE_NAME backup --with-files'
# then copy ./backups offsite as above
```

## 4. Restore (DB + files)
```bash
cd infra/docker
# put the *-database.sql.gz (+ *-files.tar / *-private-files.tar) into the container, then:
docker compose exec backend bash -lc '
  bench --site $SITE_NAME --force restore \
    /home/frappe/frappe-bench/sites/$SITE_NAME/private/backups/<DB>.sql.gz \
    --with-public-files /path/<files>.tar \
    --with-private-files /path/<private-files>.tar \
    --db-root-username root --db-root-password "$DB_ROOT_PASSWORD"'
docker compose exec backend bash -lc 'bench --site $SITE_NAME migrate'
docker compose restart backend frontend web
```
**Restore drill (do once):** create a scratch site, restore a backup into it, confirm products/
prices/debt are present and the kiosk loads. Document the date you last verified restore here.

## 5. App rollback (bad deploy)
The app is baked into the image from this repo. To roll back code:
```bash
git -C <repo> checkout <previous-good-commit>   # or a release tag on cago-production
cd infra/docker
docker compose build && docker compose up -d
docker compose exec backend bash -lc 'bench --site $SITE_NAME migrate'
```
If a migration introduced bad data, **restore the pre‑deploy backup** (§4) instead of forward‑fixing.
Always take a manual backup (§3) immediately before `migrate` on a new deploy.

## 6. Rebuild from scratch (disaster)
```bash
cd infra/docker
docker compose down            # keep volumes! (omit -v)
docker compose build && docker compose up -d
# if the DB volume is lost, restore from the newest offsite backup (§4)
```

## 7. Health checks after restore/rollback
- `docker compose ps` → backend/frontend/web/db/redis running.
- Open the kiosk (port 8080) → categories load.
- `bench --site $SITE_NAME run-tests --app cago` (optional) + `... execute cago.setup.audit.run_audit` → 11/11.
- Owner login → tra giá shows correct prices; công nợ shows expected balances.

## 8. Routine
- Keep the `backup` profile on; copy offsite daily (cron on the host copying `./backups`).
- Before each deploy: manual backup → deploy → migrate → health check; roll back on failure.
- Re‑verify a real restore quarterly. Last verified restore: **(fill in)**.
