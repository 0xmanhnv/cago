#!/usr/bin/env bash
# Cago go-live preflight — read-only checks before exposing the shop to production.
# Run from infra/docker:   bash preflight.sh
set -uo pipefail
cd "$(dirname "$0")"

ENV=".env"
fail=0
warn=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; warn=$((warn+1)); }

echo "Cago preflight =================================================="

if [ ! -f "$ENV" ]; then
  bad ".env không tồn tại — copy .env.production.example → .env rồi điền giá trị thật."
  echo "================================================================"; exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENV" 2>/dev/null; set +a

# 1. Secrets must not be defaults/placeholders.
case "${ADMIN_PASSWORD:-}" in
  ""|change-me-admin|__SET_A_STRONG_PASSWORD__) bad "ADMIN_PASSWORD còn mặc định/placeholder — ĐỔI ngay.";;
  *) [ "${#ADMIN_PASSWORD}" -lt 10 ] && note "ADMIN_PASSWORD hơi ngắn (<10 ký tự)." || ok "ADMIN_PASSWORD đã đặt.";;
esac
case "${DB_ROOT_PASSWORD:-}" in
  ""|change-me-db-root|__SET_A_DIFFERENT_STRONG_PASSWORD__) bad "DB_ROOT_PASSWORD còn mặc định/placeholder — ĐỔI ngay.";;
  *) ok "DB_ROOT_PASSWORD đã đặt.";;
esac
[ "${ADMIN_PASSWORD:-}" = "${DB_ROOT_PASSWORD:-}" ] && note "ADMIN_PASSWORD trùng DB_ROOT_PASSWORD — nên khác nhau."

# 2. TLS / public exposure.
if [ -n "${SITE_DOMAIN:-}" ] && [ "${SITE_DOMAIN}" != "cago.example.com" ]; then
  ok "SITE_DOMAIN = ${SITE_DOMAIN} (Caddy sẽ cấp/serve HTTPS)."
else
  note "SITE_DOMAIN chưa đặt domain thật → HTTPS sẽ là cert nội bộ (phải cài root CA lên thiết bị)."
fi
[ "${HTTP_PUBLISH_BIND:-0.0.0.0}" = "127.0.0.1" ] && ok "Cổng HTTP chỉ mở ở localhost (sau Caddy)." \
  || note "HTTP_PUBLISH_BIND=0.0.0.0 → :${HTTP_PUBLISH_PORT:-8080} mở HTTP trần ra mạng. Sau Caddy nên đặt 127.0.0.1."

# 3. Backups configured + offsite repointed.
grep -q "x-bench-volumes-offsite" compose.yaml && ok "Có cấu hình offsite backup." || note "Không thấy offsite backup."
grep -qE "^\s*-\s*\./backups/offsite:/offsite" compose.yaml \
  && note "Offsite vẫn trỏ ./backups/offsite (CÙNG máy) — đổi sang USB/NAS/Drive để an toàn thật." \
  || ok "Offsite đã trỏ ra ngoài ./backups/offsite."

# 4. Compose validity.
if command -v docker >/dev/null 2>&1; then
  docker compose config >/dev/null 2>&1 && ok "docker compose config hợp lệ." || bad "docker compose config LỖI — chạy 'docker compose config' để xem."
fi

echo "================================================================"
echo "Kết quả: $fail lỗi chặn, $warn cảnh báo."
[ "$fail" -gt 0 ] && { echo "→ Sửa hết lỗi chặn trước khi go-live."; exit 1; } || echo "→ Không còn lỗi chặn. Xem lại cảnh báo + chạy checklist QA (docs/38)."
