# 48 — Dựng server PRODUCTION từ đầu (runbook)

Hướng dẫn cài Cago lên một **server prod riêng** (tách khỏi máy dev). Toàn bộ chuỗi này đã chạy
thử thành công trọn vẹn trên máy dev trước khi viết, nên cứ làm theo thứ tự là lên một mạch.

Kết quả cuối: site sạch (0 hoá đơn, 0 sản phẩm demo), đúng các tài khoản thật, bot Telegram +
trợ lý AI chạy, ra Internet qua `https://app.manhnv.com`, catalog nhập từ CSV thật.

> Quy ước: máy dev = `agrimate.localhost` (đầy dữ liệu demo, GIỮ NGUYÊN). Prod = server mới, site
> nội bộ tên `cago.localhost` (tên này chỉ là header nội bộ; domain công khai là app.manhnv.com —
> xem mục 8). KHÔNG dùng `compose.override.dev.yaml` trên prod (nó mount mã nguồn + bật allow_tests).
> KHÔNG bao giờ chạy test trên prod.

---

## 0. Kiến trúc 1 server

```
Internet → Cloudflare tunnel (app.manhnv.com) → localhost:8080
        → frontend (nginx, bơm header FRAPPE_SITE_NAME_HEADER) → backend (Frappe) + web (Next.js)
        → db (MariaDB) · redis · scheduler · queue · websocket · backup
```

Tất cả chạy bằng Docker Compose từ `infra/docker/compose.yaml`. Site được chọn bằng biến
`SITE_NAME` trong `.env` (frontend bơm header này, KHÔNG phụ thuộc domain công khai).

---

## 1. Chuẩn bị server

- OS: Ubuntu 22.04/24.04 (hoặc tương đương). RAM ≥ 4GB, đĩa ≥ 30GB.
- Cài Docker Engine + Compose plugin + git:

```bash
sudo apt-get update && sudo apt-get install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # đăng xuất/đăng nhập lại để có quyền docker
docker compose version            # xác nhận compose v2
```

- Firewall: chỉ cần ra Internet (tunnel chủ động kết nối ra Cloudflare). KHÔNG cần mở 80/443 vào
  nếu dùng tunnel. (Nếu sau này phục vụ LAN trong cửa hàng qua Caddy thì mở 443 — xem mục 12.)

---

## 2. Lấy mã nguồn

```bash
git clone <repo-url> ~/cago && cd ~/cago
git checkout main            # hoặc nhánh release đã duyệt
```

---

## 3. Cấu hình `.env` prod

```bash
cd ~/cago/infra/docker
cp .env.example .env   # nếu chưa có; nếu đã có .env thì sửa
```

Đặt các giá trị **prod** (khác hẳn dev):

```ini
SITE_NAME=cago.localhost            # tên site nội bộ (header); domain công khai ở mục 8
ADMIN_PASSWORD=<mật-khẩu-Administrator-MẠNH>
DB_ROOT_PASSWORD=<mật-khẩu-root-MariaDB-MẠNH>
LOAD_SAMPLE_DATA=0                  # 0 = catalog TRỐNG (prod). 1 = demo (chỉ dev)
HTTP_PUBLISH_PORT=8080
SITE_DOMAIN=:443                    # chỉ dùng nếu bật Caddy LAN; với tunnel có thể để mặc định
```

> Sinh mật khẩu mạnh: `python3 -c "import secrets;print(secrets.token_urlsafe(24))"`.
> `.env` KHÔNG bao giờ commit (đã gitignore).

---

## 4. Đưa file bí mật lên server

Tài khoản thật nằm trong `infra/secrets/cago_real_users.json` (gitignored — không có trong repo
clone). Copy từ máy dev sang server prod (scp), KHÔNG qua git:

```bash
# từ máy dev:
scp infra/secrets/cago_real_users.json <user>@<prod-host>:~/cago/infra/secrets/
```

(File mẫu cấu trúc: `infra/secrets/cago_real_users.example.json`. Xem map tier→role ở [[real-users-seed]] / docs/28.)

---

## 5. Build + khởi động (tạo site + baseline tự động)

```bash
cd ~/cago/infra/docker
docker compose build                 # bake app cago vào image (vài phút)
docker compose up -d                 # khởi động; service one-shot `create-site` sẽ:
                                     #   bench new-site … --install-app erpnext --install-app cago
                                     #   cago.setup.seed.seed_baseline  (company "Minh Tuyết", bảng giá,
                                     #     cây danh mục, chức danh) — catalog TRỐNG vì LOAD_SAMPLE_DATA=0
docker compose logs -f create-site   # theo dõi tới khi thấy "Cago baseline seed ✓"
```

Định nghĩa biến gọn để dùng tiếp:

```bash
DC="docker compose"                  # prod: CHỈ compose.yaml, KHÔNG override.dev
SITE=cago.localhost
B(){ $DC exec -T backend bench --site "$SITE" "$@"; }   # tiện chạy bench
```

---

## 6. Seed tài khoản thật

```bash
docker cp infra/secrets/cago_real_users.json "$($DC ps -q backend)":/tmp/u.json
B execute cago.setup.seed_real_users.seed_real_users --kwargs '{"path":"/tmp/u.json"}'
$DC exec -T backend rm -f /tmp/u.json          # đừng để creds trong container
```

Kết quả: admin (System Manager + Cago Admin, đăng nhập email), owner (Cago Owner, đăng nhập SĐT),
nhân viên (chức danh → cap, giới hạn /pos, đăng nhập SĐT). Mobile-login đã bật sẵn bởi baseline.

> Chạy lại file là **authoritative**: tạo user thiếu, cập nhật quyền, đặt lại mật khẩu = giá trị
> trong file. Thêm người prod → sửa file rồi chạy lại. Dọn tài khoản test (nếu lỡ có):
> `B execute cago.setup.seed_real_users.prune_demo_accounts`.

---

## 7. Cấu hình tích hợp (trợ lý AI + Telegram + public_url)

Hai cách: **(A)** bê cấu hình thật từ máy dev sang, hoặc **(B)** nhập mới qua UI prod
(`/pos/ai-settings`, `/pos/integrations`). Cách A nhanh hơn nếu muốn giống hệt dev.

### 7A. Bê từ máy dev (chạy TRÊN MÁY DEV để lấy giá trị)

```bash
# AI/LLM (máy dev lưu ở site_config) — đọc rồi đặt y vậy trên prod:
bench --site agrimate.localhost console   # in các key: cago_llm_* , cago_assistant_name
# Telegram (lưu mã hoá trên Company) — đọc token + secret + owner_ids
```

Trên **prod**, đặt lại:

```bash
B set-config cago_assistant_name "Mạnh"
B set-config cago_llm_api_key "<key>"
B set-config cago_llm_base_url "<base_url>"
B set-config cago_llm_model "<model>"
B set-config cago_llm_provider "<provider>"
# Telegram token + secret (mã hoá) qua console:
$DC exec -T backend bench --site "$SITE" console <<'PY'
import frappe
from cago.utils.secrets import set_secret
c = frappe.get_all("Company", pluck="name", limit=1)[0]
set_secret("Company", c, "cago_telegram_bot_token", "<BOT_TOKEN>")
frappe.db.set_value("Company", c, "cago_telegram_owner_ids", "<owner-telegram-id>")
frappe.db.set_value("Company", c, "cago_public_url", "https://app.manhnv.com")
frappe.db.commit()
PY
```

### 7B. Nhập mới qua UI (sau khi đã có domain ở mục 8)
Đăng nhập admin → `/pos/ai-settings` dán key AI; `/pos/integrations` dán Bot token Telegram +
địa chỉ public. Đơn giản, không cần chạm máy dev.

Bắt buộc đặt **public_url** = domain prod (mục 8) để QR/track/deep-link/webhook đúng:

```bash
B execute cago.api.integrations.set_public_url --kwargs '{"public_url":"https://app.manhnv.com"}'
```

---

## 8. Tunnel ra Internet (domain công khai)

Theo **docs/47_TUNNEL_SETUP.md**. Tóm tắt cho server mới:

```bash
# cài cloudflared, đăng nhập zone manhnv.com (tải cert.pem), tạo/dùng tunnel:
cloudflared tunnel login                       # chọn zone manhnv.com
cloudflared tunnel create cago-prod            # hoặc dùng lại tunnel cũ
cloudflared tunnel route dns cago-prod app.manhnv.com   # CNAME → tunnel server mới
# ~/.cloudflared/config.yml: ingress app.manhnv.com → http://localhost:8080 (+ 404 catch-all)
setsid nohup cloudflared tunnel --config ~/.cloudflared/config.yml run cago-prod \
  > ~/.cloudflared/cago.log 2>&1 < /dev/null &
```

> Đổi `app.manhnv.com` từ server dev sang prod = sửa CNAME đó trỏ vào tunnel của server prod
> (một domain chỉ phục vụ một tunnel tại một thời điểm). Bền qua reboot: `sudo cloudflared service install`.

---

## 9. Đăng ký webhook Telegram

```bash
B execute cago.api.telegram.set_webhook        # → https://app.manhnv.com/api/method/cago.api.telegram.webhook
```

(no-op nếu chưa cấu hình bot token ở mục 7.)

---

## 10. Nhập catalog thật từ CSV

Theo **docs/user/NHAP_DU_LIEU_CSV.md** (mẫu: `docs/user/products_import_template.csv`).

```bash
docker cp /duong-dan/catalog.csv "$($DC ps -q backend)":/tmp/catalog.csv
B execute cago.setup.sample_data.import_catalog --kwargs '{"csv_path":"/tmp/catalog.csv"}'
$DC exec -T backend rm -f /tmp/catalog.csv
```

`import_catalog` chỉ nhập **sản phẩm + giá** (không tạo tồn/lô demo). Nhập tồn thật sau bằng màn
**Nhập hàng** (`/pos/receive`) hoặc **Nhập hàng loạt** (`/pos/bulk`).

---

## 11. Nghiệm thu (checklist)

```bash
B execute frappe.client.get_count --kwargs '{"doctype":"Sales Invoice"}'   # = 0
B execute frappe.client.get_count --kwargs '{"doctype":"Item"}'            # = số mã trong CSV
curl -sI https://app.manhnv.com | head -1                                 # HTTP/2 200
```

- [ ] `https://app.manhnv.com` mở được, đăng nhập owner bằng SĐT chạy.
- [ ] Màn **Nhân viên & phân quyền** chỉ có đúng các tài khoản thật (không có `@cago.test`/`_test_`).
- [ ] 0 hoá đơn, catalog = CSV thật, không có "8 tỷ" doanh thu ảo.
- [ ] Trợ lý AI trả lời; bot Telegram nhận lệnh; QR/track ra đúng domain prod.
- [ ] Chốt thử 1 đơn tiền mặt rồi **huỷ** (đảm bảo luồng bán chạy), kiểm tồn/▴ công nợ.
- [ ] Sao lưu chạy (mục 12).

---

## 12. Vận hành

- **Backup**: service `backup` chạy theo lịch (xem compose.yaml + `CAGO_BACKUP_OFFSITE_DIR`).
  Thủ công: `B backup --with-files`. Đưa bản backup ra ổ/đám mây ngoài server.
- **Restart sau khi đổi backend**: recreate backend → `docker compose up -d --force-recreate frontend web`
  (frontend 502 nếu upstream IP cũ — xem [[deploy-restart-frontend-after-backend]]).
- **Cập nhật code**: `git pull` → `docker compose build` → `docker compose up -d` →
  `B migrate` → restart frontend+web.
- **Log**: `docker compose logs -f backend` (hoặc frontend/web/scheduler).
- **HTTPS LAN trong cửa hàng** (tuỳ chọn, song song tunnel): đặt `SITE_DOMAIN` = IP/đè domain
  LAN để Caddy cấp cert; mở 443. Đây là đường RIÊNG với tunnel.
- **Đổi domain**: xem docs/47 mục 2.

---

## 13. Bảo mật / nhắc nhở

- `.env`, `infra/secrets/*` KHÔNG commit (đã gitignore). Mật khẩu prod khác hẳn dev.
- KHÔNG bật `allow_tests` / KHÔNG chạy `bench run-tests` trên prod ([[never-run-tests-on-live-site]]).
- Nhân viên chỉ thấy /pos, không thấy giá vốn/biên lợi nhuận (RBAC docs/28). Owner được bảo vệ
  (PROTECTED_ROLES) — chỉ `Administrator`/System Manager đổi được owner ([[rbac-tiers-and-ios-zoom]]).
- Xoá mọi file secret tạm trong container sau khi dùng (`rm -f /tmp/...`).
- Cảnh báo an toàn hoá chất giữ nguyên trên thẻ sản phẩm; không tự chế liều lượng.
```
