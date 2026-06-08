# 47 — Public URL via Cloudflare Tunnel (cài đặt & đổi domain)

Cách app Cago ra Internet (HTTPS) bằng **Cloudflare named tunnel** — domain ổn định, không cần mở
port/IP tĩnh, TLS do Cloudflare lo. Tunnel đẩy traffic vào `http://localhost:8080` (cùng origin mà
Next.js + Frappe đang phục vụ).

> Hiện tại (2026-06-08): public URL = **https://app.manhnv.com**. Tunnel name `cago`,
> id `5296663b-481b-491e-a2cc-7c615656f45c`. Trước đó là `app.openctem.io` (đã bỏ).

Quan trọng: **mã nguồn không hard-code domain** — app domain-agnostic (session cookie cùng origin).
Đổi domain chỉ chạm cấu hình hạ tầng + 2 thiết lập trong app, KHÔNG sửa code.

---

## 0. Thành phần

| Thứ | Ở đâu | Vai trò |
|---|---|---|
| `cloudflared` binary | `~/.local/bin/cloudflared` | client chạy tunnel |
| Cert (uỷ quyền zone) | `~/.cloudflared/cert.pem` | để TẠO/SỬA DNS của một zone Cloudflare |
| Credentials tunnel | `~/.cloudflared/<tunnelID>.json` | để CHẠY tunnel |
| Config | `~/.cloudflared/config.yml` | ingress: domain → `localhost:8080` |
| `Company.cago_public_url` | Frappe (site agrimate.localhost) | URL công khai cho QR / /track / Zalo / deep-link |
| Telegram webhook | đăng ký với Telegram | URL bot nhận update |

Cert ≠ credentials: **cert** uỷ quyền một *zone* (vd `manhnv.com`) để quản DNS; **credentials**
chỉ để chạy tunnel. Đổi sang domain ở zone khác ⇒ cần cert của zone đó.

---

## 1. Chạy / restart tunnel

```bash
# chạy (detached, sống qua phiên ssh, ghi log)
setsid nohup cloudflared tunnel --config ~/.cloudflared/config.yml run cago \
  > ~/.cloudflared/cago.log 2>&1 < /dev/null &

# kiểm tra (phải thấy "Registered tunnel connection" ~4 lần)
pgrep -af 'cloudflared tunnel .*run cago'
tail -f ~/.cloudflared/cago.log

# restart (sau khi sửa config.yml)
kill "$(pgrep -f 'cloudflared tunnel .*run cago' | head -1)"; sleep 2
setsid nohup cloudflared tunnel --config ~/.cloudflared/config.yml run cago \
  > ~/.cloudflared/cago.log 2>&1 < /dev/null &
```

> Hiện chưa cài thành systemd service ⇒ **tắt máy là tunnel chết**. Để bền qua reboot:
> `sudo cloudflared service install` (cần sudo) rồi `sudo systemctl enable --now cloudflared`.

`config.yml` mẫu:

```yaml
tunnel: 5296663b-481b-491e-a2cc-7c615656f45c
credentials-file: /home/ubuntu/.cloudflared/5296663b-481b-491e-a2cc-7c615656f45c.json

ingress:
  - hostname: app.manhnv.com
    service: http://localhost:8080
  - service: http_status:404      # bắt buộc: rule cuối phải là catch-all
```

---

## 2. ĐỔI DOMAIN (vd sang `app.manhnv.com`)

### 2a. Nếu domain mới là **subdomain của zone cert hiện có** (vd `pos.manhnv.com` khi cert đã là manhnv.com)
Bỏ qua bước login — làm thẳng từ 2c.

### 2b. Nếu domain mới ở **zone khác** (vd đang ở openctem.io, đổi sang manhnv.com)
Domain phải **đã ở trong tài khoản Cloudflare** (add domain + đổi nameserver, trạng thái Active).
Rồi uỷ quyền cert cho zone mới:

```bash
# cloudflared từ chối nếu cert.pem cũ còn → backup nó trước
mv ~/.cloudflared/cert.pem ~/.cloudflared/cert.OLDZONE.pem.bak

# login (mở trình duyệt) → CHỌN ĐÚNG ZONE domain mới → cert.pem mới được tải về
cloudflared tunnel login
```

> Lỗi hay gặp: chạy `route dns cago app.manhnv.com` khi cert vẫn là zone cũ (openctem.io) →
> cloudflared tạo nhầm `app.manhnv.com.openctem.io`. Phải login đúng zone manhnv.com TRƯỚC.

### 2c. Tạo DNS + sửa config + restart
```bash
cloudflared tunnel route dns cago app.manhnv.com      # tạo CNAME app.manhnv.com → tunnel
# sửa hostname trong ~/.cloudflared/config.yml thành app.manhnv.com
# restart tunnel (xem mục 1)
```

### 2d. Cập nhật trong app (chạy trong container backend)
```bash
cd infra/docker
docker compose -f compose.yaml -f compose.override.dev.yaml exec -T backend \
  bench --site agrimate.localhost execute cago.api.integrations.set_public_url \
  --kwargs '{"public_url":"https://app.manhnv.com"}'

# đăng ký lại webhook Telegram (no-op nếu chưa cấu hình bot)
docker compose -f compose.yaml -f compose.override.dev.yaml exec -T backend \
  bench --site agrimate.localhost execute cago.api.telegram.set_webhook
```

### 2e. Verify
```bash
curl -sI https://app.manhnv.com | head -1      # mong đợi: HTTP/2 200
```

### 2f. Dọn domain cũ (tuỳ chọn)
- Bỏ hostname cũ khỏi `config.yml` (giữ lại catch-all 404) + restart ⇒ tunnel ngừng phục vụ domain cũ.
- Xoá CNAME cũ trong **Cloudflare dashboard → DNS** (cloudflared KHÔNG có lệnh xoá DNS).

---

## 3. Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử |
|---|---|
| `route dns` tạo `app.X.com.OLDZONE` | cert còn ở zone cũ → làm 2b (login zone đúng) |
| `login would overwrite cert.pem` | có cert cũ → `mv` đi rồi login lại |
| Domain mới 404 | hostname chưa có trong ingress, hoặc chưa restart tunnel |
| Domain mới không phân giải | CNAME chưa tạo / domain chưa Active trên Cloudflare |
| QR/link/track vẫn ra domain cũ | quên `set_public_url` |
| Bot Telegram im | quên `set_webhook`; kiểm `cago.api.telegram.webhook_info` |
| Tunnel chết sau reboot | chưa cài systemd service (`cloudflared service install`) |

> LAN HTTPS trong cửa hàng (Caddy + `SITE_DOMAIN` ở `infra/docker/.env`) là đường RIÊNG, không
> liên quan tunnel — đừng nhầm hai cái.
