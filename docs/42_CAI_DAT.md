# 42 — Cài đặt (từ máy trắng đến chạy được)

Hướng dẫn cài đặt Cago bằng Docker. Cago = ERPNext v16 (backend) + app `cago` + Next.js (`web/`),
đóng gói trong Docker compose ở `infra/docker/`. Chi tiết kỹ thuật từng service: `infra/docker/README.md`.

> Triển khai THẬT (domain, HTTPS, đổi mật khẩu, backup, QA thiết bị): xem [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md).

## 1. Yêu cầu máy
- Máy chủ: **mini-PC đặt tại cửa hàng** hoặc **VPS**. Tối thiểu ~**4GB RAM, 2 CPU, 20GB đĩa** (thoải mái: 8GB RAM).
- Hệ điều hành: Linux (Ubuntu/Debian khuyến nghị). macOS/Windows chạy dev được.
- **Docker + Docker Compose v2**. Kiểm tra: `docker --version` và `docker compose version`.
  - Ubuntu cài nhanh: `curl -fsSL https://get.docker.com | sh` (rồi `sudo usermod -aG docker $USER`, đăng xuất/đăng nhập lại).

## 2. Lấy mã nguồn
```bash
git clone <repo-url> cago && cd cago/infra/docker
```

## 3. Cấu hình `.env`
- **Thử nghiệm (dev, có dữ liệu mẫu):**
  ```bash
  cp .env.example .env
  ```
- **Chạy thật (production, catalog rỗng):**
  ```bash
  cp .env.production.example .env
  ```
  Mở `.env` điền: `ADMIN_PASSWORD`, `DB_ROOT_PASSWORD` (mạnh, khác nhau), `SITE_DOMAIN` (nếu có domain).
  `LOAD_SAMPLE_DATA=0` để không nạp sản phẩm demo.

## 4. Build & chạy
```bash
docker compose build                 # build image (ERPNext + cago + web). Lần đầu khá lâu.
docker compose up -d                 # khởi động; service create-site tự tạo site 1 lần
docker compose logs -f create-site   # xem tới khi tạo site xong rồi Ctrl-C
```
`create-site` (chạy 1 lần, idempotent): tạo site → **seed_baseline** (company, price list, danh mục, job role) → nạp demo nếu `LOAD_SAMPLE_DATA=1`. Bật/tắt `up`/`down` an toàn (dữ liệu nằm trong volume).

## 5. Truy cập & đăng nhập
- Mở trình duyệt: **`http://<IP-máy>:8080`** (vd `http://192.168.1.10:8080`).
- Quản trị ERPNext: `Administrator` / `ADMIN_PASSWORD`.
- Chủ/nhân viên: tạo tài khoản trong **Cài đặt → 👥 Nhân viên & quyền** (xem [docs/user](user/)).

## 6. Nạp catalog thật + tồn kho
```bash
# trong frappe-bench của container (hoặc dùng script):
docker compose exec backend python /home/frappe/frappe-bench/apps/cago/scripts/import_products.py \
  --site <site> --csv /đường-dẫn/catalog.csv
```
Hoặc theo [user/NHAP_DU_LIEU_CSV.md](user/NHAP_DU_LIEU_CSV.md) (có sẵn `user/catalog_minh_tuyet.csv`).
Import **không** tạo tồn — nhập số lượng tồn qua màn **📥 Nhập hàng**.

## 7. Lệnh thường dùng
```bash
docker compose ps                                   # trạng thái service
docker compose logs -f backend                      # log backend
docker compose exec backend bench --site <site> migrate     # chạy migration
docker compose exec backend bench --site <site> console     # python console
docker compose restart frontend web                 # sau khi recreate backend (tránh 502)
```

## 8. Cập nhật phiên bản (deploy code mới)
```bash
git pull
docker compose build backend web
docker compose up -d
docker compose exec backend bench --site <site> migrate
docker compose restart frontend web
```
> Backend đổi (kể cả test) **phải build lại backend** (override dev không tự nạp). Recreate backend → **restart `frontend` + `web`** (nginx giữ IP cũ → 502).

## 9. Sao lưu & khôi phục
- Bật backup tự động: `docker compose --profile backup up -d backup` (xem [38](38_GO_LIVE_RUNBOOK.md) mục B).
- Trong app: **Cài đặt → 💾 Sao lưu dữ liệu**. Khôi phục/rollback: [33_OPERATIONS_RESTORE_ROLLBACK.md](33_OPERATIONS_RESTORE_ROLLBACK.md).

## 10. Dừng / khởi động lại
```bash
docker compose stop      # dừng (giữ dữ liệu)
docker compose up -d      # chạy lại
docker compose down       # gỡ container (dữ liệu vẫn trong volume)
# docker compose down -v  # !! XOÁ luôn dữ liệu (volume) — chỉ khi muốn làm lại từ đầu
```

---
Tiếp theo để chạy thật an toàn: **[38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md)** (HTTPS bằng Caddy, đổi mật khẩu, backup offsite, QA máy in/quét/offline).
Cấu trúc dự án & 3 lớp dữ liệu: **[17_REPO_STRUCTURE.md](17_REPO_STRUCTURE.md)**.
