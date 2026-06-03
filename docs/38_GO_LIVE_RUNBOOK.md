# 38 — Go-Live Runbook (hardening, backup, device QA)

Mục tiêu: đưa Cago từ "chạy được trên máy dev" sang **vận hành thật an toàn** cho một cửa
hàng ở nông thôn. Làm theo thứ tự. Các lệnh chạy trong `infra/docker/`.

> Bối cảnh: 1 máy chủ nhỏ (mini-PC) trong cửa hàng, vài tablet/điện thoại + máy in nhiệt
> 58mm + máy quét mã vạch trong cùng mạng LAN. Chủ ít rành công nghệ.

---

## A. Bảo mật trước khi go-live (bắt buộc)

1. **Đổi mật khẩu Administrator mặc định.** `infra/docker/.env` đang là
   `ADMIN_PASSWORD=change-me-admin`. Đặt mật khẩu mạnh, rồi đổi cả trên site đang chạy:
   ```bash
   docker compose exec backend bench --site agrimate.localhost set-admin-password '<MẬT_KHẨU_MỚI>'
   ```
   Administrator chỉ dùng để quản trị; chủ/nhân viên đăng nhập bằng tài khoản riêng (xem
   "👥 Nhân viên & quyền").

2. **Đổi mọi mật khẩu hạ tầng** trong `.env` (DB, v.v.) khỏi giá trị mẫu.

3. **HTTPS trên LAN.** Trình duyệt báo "Not Secure" trên `http://` và `navigator.clipboard`,
   máy ảnh QR… bị giới hạn. Hai cách:
   - **Tên miền nội bộ + chứng chỉ tin cậy:** đặt một reverse-proxy (Caddy/Traefik) trước
     `frontend`, cấp chứng chỉ cho tên kiểu `cago.local`. Đơn giản nhất cho 1 máy.
   - **Chứng chỉ tự ký** cài vào các tablet/điện thoại (chấp nhận thủ công 1 lần/thiết bị).
   Tối thiểu: phục vụ qua HTTPS để phiên đăng nhập + sao chép QR + quét mã hoạt động đầy đủ.

4. **Không mở ra Internet.** Cago thiết kế cho LAN. Nếu cần truy cập từ xa, dùng VPN, KHÔNG
   forward cổng thẳng.

5. **Khoá quyền theo vai trò.** Mỗi nhân viên một tài khoản; chỉ bật capability cần thiết
   (giá vốn/lãi/biên ẩn với nhân viên — đã có audit kiểm). Xem màn "👥 Nhân viên & quyền".

---

## B. Sao lưu & khôi phục (bắt buộc — đây là tiền + công nợ của tiệm)

**Bật sao lưu tự động** (opt-in, không ảnh hưởng stack thường):
```bash
docker compose --profile backup up -d backup
```
- Mặc định: mỗi 24h (`BACKUP_INTERVAL`), giữ 14 ngày (`BACKUP_KEEP_DAYS`).
- Bản sao ghi vào `infra/docker/backups/offsite/` (DB + files).
- **Off-machine thật:** trỏ `./backups/offsite` (mục `x-bench-volumes-offsite` trong
  `compose.yaml`) sang **USB/ổ NAS/thư mục đồng bộ Google Drive** để bản sao không nằm cùng máy.
  Mất máy chủ mà sao lưu cùng máy = mất luôn.

**Sao lưu thủ công ngay** (trước khi nâng cấp/sửa lớn):
- **Trong app (khuyến nghị cho chủ):** Cài đặt cửa hàng → **💾 Sao lưu dữ liệu** → "Sao lưu ngay".
  Chạy nền, tự chép ra `/offsite` nếu đã gắn — không cần dòng lệnh.
- Hoặc dòng lệnh:
  ```bash
  docker compose exec backend bench --site agrimate.localhost backup --with-files --backup-path /offsite
  ```

**Diễn tập khôi phục** (làm 1 lần để chắc bản sao dùng được — xem chi tiết docs/33):
khôi phục bản mới nhất vào một site thử, kiểm công nợ + vài hoá đơn khớp. Sao lưu chưa
test-restore = chưa phải sao lưu.

---

## C. QA trên thiết bị thật (tôi không tự chạy phần cứng được — chủ/kỹ thuật làm)

Mở trên đúng thiết bị sẽ dùng ở quầy. Đánh dấu ✅ từng mục.

### C1. Máy in nhiệt 58mm (in phiếu)
- [ ] Bán 1 đơn tiền mặt → bật "Tự in phiếu" → phiếu ra đúng khổ 58mm, không tràn/cắt chữ.
- [ ] In lại từ "🖨 In lại" → đúng hoá đơn.
- [ ] Tiếng Việt có dấu in đúng (không vuông/mất dấu).

### C2. Máy quét mã vạch
- [ ] Ở màn Bán, quét 1 sản phẩm có mã vạch → tự thêm vào giỏ.
- [ ] Ở "Tra cứu", quét → mở đúng sản phẩm.
- [ ] Mã không có trong hệ thống → báo "không tìm thấy", không treo.

### C3. Bán offline (mạng chập chờn — rủi ro cao ở nông thôn)
- [ ] Mở /pos/sell khi CÓ mạng (để cache catalog) → TẮT wifi.
- [ ] Trang vẫn mở; tìm sản phẩm + chọn khách cũ vẫn chạy.
- [ ] Chốt 1 đơn tiền mặt + 1 đơn ghi nợ → hiện "PHIẾU TẠM — CHƯA ĐỒNG BỘ"; badge "Offline · 2 đơn chờ".
- [ ] Chuyển khoản/QR + Thêm khách mới + mã giảm giá bị khoá khi offline.
- [ ] BẬT mạng lại → tự đồng bộ → 2 hoá đơn thật xuất hiện, tồn giảm đúng 1 lần/đơn, công nợ tăng đúng.
- [ ] Bấm chốt 2 lần lúc mạng yếu → chỉ 1 hoá đơn (chống trùng).

### C4. Màn phụ cho khách (CFD) + kiosk
- [ ] Mở "🖥 Màn hình phụ cho khách" trên màn thứ 2 ở quầy → giỏ + tổng tiền cập nhật theo màn bán; KHÔNG hiện giá vốn.
- [ ] Kiosk trên màn to ở cửa hàng: danh mục/sản phẩm vừa khung; sơ đồ hiện trọn vẹn; trợ lý mở dạng cửa sổ chat ở góc trên PC, full màn trên tablet.
- [ ] Thử trên điện thoại khách: kiosk + trợ lý dùng tốt, nút đủ to.

### C5. Thanh toán QR (VietQR)
- [ ] Cài tài khoản ở "💳 QR thu tiền" → hiện QR khi thu nợ/bán; quét bằng app ngân hàng ra đúng số tiền.

---

## D. Dữ liệu sạch trước khi mở cửa
- [ ] Vào **🩺 Kiểm tra dữ liệu**: xử lý hết "Thiếu giá", gộp "Có thể trùng", bổ sung ảnh/phân loại.
- [ ] Đánh dấu **⭐ Hàng khuyên dùng** cho các mặt hàng muốn đẩy.
- [ ] Kiểm **Sơ đồ cửa hàng** khớp bố trí thật; bật "kiosk cố định" trên tablet đặt tại quầy.

---

## E. Sau go-live (định kỳ)
- Tuần: liếc 🩺 Kiểm tra dữ liệu + "Cảnh báo hôm nay" (hàng sắp hết / lô cận hạn).
- Tháng: kiểm thư mục sao lưu offsite có bản mới; thử khôi phục 1 lần/quý.
