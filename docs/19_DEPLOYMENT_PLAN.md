# 19 — Deployment Plan

## 1. Deployment options

### Option A — Cloud VPS

Pros:

- remote access
- easier backup/offsite
- easier support

Cons:

- depends on internet at shop

### Option B — Local mini PC

Pros:

- works on local LAN
- better if internet unstable
- kiosk/POS can keep working locally

Cons:

- needs hardware maintenance
- backup must be handled carefully

### Option C — Hybrid

Recommended later:

- ERPNext cloud or local primary
- local sync/cache for kiosk if needed
- regular offsite backups

## 2. MVP recommendation

Start with the simplest reliable deployment for development:

```text
Dev: local bench or Docker
Pilot: VPS if shop internet is stable
Fallback: local mini PC if internet is unstable
```

## 3. Required services

ERPNext/Frappe needs:

- MariaDB
- Redis
- Node/Yarn build toolchain
- Python environment
- bench
- nginx/supervisor in production-like setup

## 4. Backup plan

Minimum:

- daily database backup
- daily files/images backup
- weekly offsite backup
- monthly restore test

## 5. Tablet setup

- Android tablet 10 inch or larger
- browser kiosk mode
- no admin login
- locked URL
- stable Wi-Fi
- always plugged in
- screen timeout disabled during store hours

## 6. Rollout stages

### Stage 1

Use system for tra giá only.

### Stage 2

Add sửa giá.

### Stage 3

Add ghi nợ/trả nợ.

### Stage 4

Add POS sale.

### Stage 5

Add kiosk.

### Stage 6

Evaluate chatbot.

## 7. Rollback

Always keep:

- spreadsheet export of products
- native POS fallback
- manual paper process fallback during pilot
- database backup before migration
