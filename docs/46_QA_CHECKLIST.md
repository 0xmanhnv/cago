# 46 — QA checklist (thiết bị thật) + smoke tích hợp kênh

Tự động hoá **không** kiểm được trải nghiệm thật của người dùng (nhất là chủ không rành công nghệ)
và các tích hợp cần tài khoản thật. Đây là checklist chạy **bằng tay trên máy thật** — đánh dấu ✅/❌
mỗi mục, ghi lỗi kèm ảnh chụp. Ưu tiên chạy trước khi cô Tuyết dùng thật.

Chuẩn bị: mở app trên **điện thoại + máy tính**, đăng nhập 1 tài khoản **nhân viên** (cap `sell`) và
1 tài khoản **admin**. Có vài sản phẩm + 1 khách có SĐT trong dữ liệu.

---

## 1. Bán hàng (POS `/pos/sell`) — nhân viên
- [ ] Mở ca; tìm sản phẩm (tên/biệt danh/mã vạch), thêm vào giỏ, sửa số lượng.
- [ ] Bán **tiền mặt**: tổng đúng, in/hiện phiếu, tồn giảm đúng.
- [ ] Bán **chuyển khoản (QR)**: QR hiện đúng số tiền; xác nhận đã nhận.
- [ ] Bán **ghi nợ**: bắt chọn khách thật; vượt hạn mức → bị chặn; trong hạn mức → ghi nợ đúng.
- [ ] **Chia tiền** (mặt+CK / thiếu→nợ / thừa→thối): số tiền & nợ/thối đúng.
- [ ] **Giảm giá / sửa giá**: khi công tắc OFF → không cho; ON → trong hạn mức nhân viên; dưới giá sàn → chặn.
- [ ] **Tích/đổi điểm** tại quầy: điểm trừ đúng, không âm.
- [ ] **Mã giảm giá (coupon)**: áp đúng, quá lượt → chặn.
- [ ] **Đóng ca**: tiền mặt khớp; chế độ "đóng mù" → nhân viên không thấy số dự kiến, chủ thấy chênh lệch.

## 2. Trả & đổi hàng
- [ ] Trả 1 phần hoá đơn có giảm giá → hoàn đúng **tiền sau giảm** (không hoàn giá gốc).
- [ ] **Đổi hàng**: hiện chênh lệch thu thêm/hoàn lại đúng.
- [ ] **Đổi hàng — chống nhân đôi**: bấm "Đổi" rồi **tắt mạng giữa chừng** và bấm lại → chỉ **một**
      phiếu trả + **một** phiếu bán mới (idempotency client_uuid). *(Bug đã fix — cần xác nhận tay.)*

## 3. Công nợ
- [ ] Ghi nợ / thu nợ (nếu công tắc cho nhân viên thu nợ ON); chủ luôn làm được.
- [ ] Xác nhận nợ (chữ ký/ảnh) khi vượt ngưỡng cấu hình.
- [ ] Sổ nợ + sao kê khách: số dư & lịch sử đúng; link mở đúng khách (theo slug).

## 4. Kiosk + đặt hàng từ xa (khách)
- [ ] Duyệt danh mục/sản phẩm; **KHÔNG thấy HSD**, không thấy giá vốn.
- [ ] Sản phẩm hoá chất luôn có **cảnh báo an toàn**.
- [ ] Tạo đơn (wanted list): chọn liên hệ + giao/nhận + cách thanh toán → ra **mã đơn**.
- [ ] **Tra cứu đơn** `/track`: nhập mã + đúng SĐT → thấy trạng thái; **sai SĐT → từ chối**
      (thử SĐT khác 1–2 số cuối phải KHÔNG vào được).
- [ ] Trợ lý: hỏi sản phẩm có bán → trả lời + thẻ giá; hỏi thứ **không bán** ("xe máy") → "chưa tìm
      thấy" + gợi gọi người bán (KHÔNG trả nhầm sản phẩm khác); hỏi **liều thuốc** → từ chối + cảnh báo.

## 5. Bán offline (mất mạng) — việc lớn cần kiểm kỹ
- [ ] Mở `/pos/sell` khi có mạng (để cache), **tắt wifi/4G**: trang vẫn mở, tìm sản phẩm + chọn khách cũ chạy.
- [ ] Chốt 1 đơn **tiền mặt** + 1 đơn **ghi nợ** (khách đã cache) → hiện **phiếu tạm "CHƯA ĐỒNG BỘ"**,
      badge "Offline · N đơn chờ".
- [ ] Chuyển khoản/QR + Thêm khách mới + coupon **bị khoá** khi offline.
- [ ] **Bật mạng lại** → tự đồng bộ; badge "Đã đồng bộ"; hoá đơn thật xuất hiện; tồn giảm **đúng 1 lần/đơn**.
- [ ] Bấm chốt 2 lần lúc mạng chập chờn → **chỉ 1 hoá đơn** (dedup client_uuid).

## 6. Chủ / Admin
- [ ] Tra giá / sửa giá; thêm/sửa sản phẩm (ảnh, đơn vị, lô/HSD); nhập hàng tạo lô.
- [ ] Báo cáo hôm nay; cảnh báo hết hàng/cận hạn.
- [ ] **Công tắc cài đặt**: bật/tắt mỗi công tắc → kiểm UI ẩn/hiện đúng **và** thao tác bị server chặn khi OFF
      (mở 2 tab, đổi công tắc, thử thao tác — không được "lách" ở client).
- [ ] **Nhân viên & phân quyền**: tạo nhân viên, gán chức danh; **⚙️ Quản trị kỹ thuật → Cấp/Thu quyền**
      (không tự đổi quyền của chính mình / của chủ thật). Người được cấp thấy màn kỹ thuật; thu lại thì mất.

## 7. Kết nối & Kênh (admin) — smoke tích hợp (cần tài khoản thật)
> Chỉ chạy được khi đã có Bot Token (BotFather) / OA Zalo / HTTPS công khai. Xem docs/45.

**Telegram (outbound, chỉ cần token + chat id):**
- [ ] `/pos/integrations` → nhập **Bot Token** + **Chat ID** nhóm → **Lưu** → **📨 Gửi thử** → nhóm nhận tin.
- [ ] Tạo 1 đơn kiosk / gọi nhân viên → nhóm Telegram (và Zalo nếu cấu hình) nhận thông báo.

**Telegram (inbound — cần HTTPS công khai):**
- [ ] Nhập **Địa chỉ công khai** (Cloudflare/tên miền) → **🔗 Đăng ký nhận lệnh** → trạng thái webhook OK.
- [ ] Trong nhóm gõ `/doanhthu`, `/no`, `/tonkho`, `/viec` → bot trả số liệu đúng.
- [ ] Gõ lệnh từ **chat lạ** (không phải nhóm cấu hình) → bot **không** trả lời.

**Zalo Mini App (Phase 3b — dự án `zmp` riêng):**
- [ ] Sau khi publish: mở Mini App → duyệt + đặt đơn (gọi `kiosk.create_wanted_list`); prefill tên/SĐT.

**Bảo mật cần xác nhận:** non-admin **không** mở được `/pos/integrations`; token/secret nhập xong chỉ
hiện "đã lưu" (không lộ lại giá trị).

---

## Ghi nhận nợ kỹ thuật (chấp nhận có chủ đích — xem lại khi cần)
- **Split-payment**: race liên-request về hạn mức nợ chỉ xảy ra nếu 2 phiên bán-chịu **cùng 1 khách
  đồng thời** — gần như không trên 1 quầy. Hiện chặn đúng qua rollback.
- Chưa có **E2E tự động** (Playwright) cho luồng đăng nhập→bán→đóng ca; checklist này thay thế tạm thời.
