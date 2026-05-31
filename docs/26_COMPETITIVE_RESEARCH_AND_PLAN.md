# 26 — Nghiên cứu hệ thống tương tự & Kế hoạch tính năng

Học hỏi từ POS/quản lý bán lẻ SMB Việt Nam (KiotViet, Sapo) và phần mềm cho **đại lý
vật tư nông nghiệp** (agrovet/agro-dealer: Agrohands, AgroVyapar, PawaPOS).

## 1. Tính năng hay học được

**Bán lẻ SMB Việt Nam (KiotViet / Sapo):**
- Cảnh báo **tồn thấp + hàng bán chậm** (slow-moving).
- **Báo cáo trực quan** theo ngày/tuần/tháng (doanh thu, lãi/lỗ, tồn) — KiotViet/Sapo có 20+ biểu đồ.
- **Chia sẻ qua Zalo/QR** (gửi link đặt hàng/hóa đơn), thanh toán QR/ví.
- **Bán offline, đồng bộ khi có mạng** — quan trọng vùng mạng yếu.
- **CRM/khách hàng thân thiết**, lịch sử mua.
- **Dashboard xem trên điện thoại** cho chủ.

**Đại lý vật tư nông nghiệp (agrovet/agro-dealer):**
- **Theo lô (batch) + hạn sử dụng + FEFO** cho thuốc/vật tư; **cảnh báo sắp hết hạn** (bắt buộc với thuốc BVTV/thú y).
- **Sổ nợ khách (Udhar/Khata)** + chia sẻ hóa đơn qua SMS/WhatsApp/Zalo.
- **Giá nhập (cost), MRP, ngày SX/HSD theo lô**; barcode/QR.
- Báo cáo: **hàng bán nhanh/chậm, giá trị tồn, lợi nhuận**.
- Truy xuất lô theo quy định (license/lot) cho hóa chất.

## 2. Đối chiếu app Cago hiện tại

| Tính năng | Cago đã có | Ghi chú |
|---|---|---|
| Công nợ + sổ chi tiết từng khách | ✅ | + huỷ bút toán nhầm |
| Nhắc nợ / báo hàng về qua Zalo (draft) | ✅ | chưa gửi tự động |
| Cảnh báo hàng sắp hết | ✅ (thủ công) | theo trạng thái nhập tay |
| Báo cáo hôm nay/tuần/tháng + bán chạy | ✅ | thiếu bán chậm, lãi gộp, giá trị tồn |
| Kiosk catalog + trợ lý AI + an toàn hóa chất | ✅ | điểm mạnh vượt KiotViet/Sapo |
| Phân quyền/bảo mật, ẩn giá nhập | ✅ | |
| **Lô + hạn sử dụng + cảnh báo HSD** | ❌ | **thiếu — quan trọng cho thuốc** |
| **Nhập hàng → tồn kho thật** | ❌ | đang dùng trạng thái tay |
| **Barcode/QR (tạo + quét)** | ❌ | tra/bán nhanh |
| **Offline/sync** | ❌ | mạng nông thôn yếu |
| Lịch sử mua của khách (CRM) | ⚠️ một phần | có sổ nợ, chưa có lịch sử mua |

## 3. Kế hoạch triển khai (ưu tiên)

### Phase 1 — Đặc thù nông nghiệp + an toàn (ưu tiên cao)
1. **Lô hàng + hạn sử dụng (HSD)** dùng **ERPNext Batch native**: bật batch cho hàng hóa chất/thuốc; owner nhập lô + HSD; **báo cáo "Hàng sắp hết hạn"**; kiosk/staff hiển thị "còn hạn đến…"; chặn/cảnh báo bán hàng quá hạn. → an toàn + tuân thủ.
2. **Nhập hàng đơn giản (owner)**: nút "Nhập hàng" → tăng **tồn kho thật** (+ giá nhập theo lô) → cảnh báo tồn thấp theo số thật thay vì tay.
3. **Báo cáo mở rộng (owner-only)**: hàng bán chậm, **lãi gộp**, giá trị tồn.

### Phase 2 — Bán hàng & tiện ích
4. **Barcode/QR**: sinh mã cho sản phẩm + **quét bằng camera** để tra/bán nhanh; in nhãn.
5. **Lịch sử mua của khách** (CRM nhẹ) + nhắc theo mùa vụ.
6. **Chia sẻ Zalo/QR**: QR cho "đơn khách chọn" ở kiosk; link/QR sản phẩm.

### Phase 3 — Hạ tầng & nâng cao
7. **Offline/sync** cho kiosk/POS (cache local trên mini-PC) — chịu được mất mạng.
8. **Dashboard biểu đồ** cho owner (doanh thu/tồn/nợ theo thời gian).
9. **Bán chịu trừ tồn kho** (hóa đơn thay Journal Entry) — gắn với tồn thật ở Phase 1.

## 4. Đề xuất bắt đầu
Khởi động **Phase 1** — đặc biệt **(1) Lô + HSD + cảnh báo hết hạn** vì đây là khác biệt cốt lõi của ngành vật tư nông nghiệp (thuốc có hạn dùng), tận dụng được Batch có sẵn của ERPNext, và tăng tính an toàn.

## Nguồn
- POS Việt Nam (tổng hợp): <https://ibos.io/top-15-pos-software-in-vietnam/>
- KiotViet: <https://play.google.com/store/apps/details?id=net.citigo.kiotviet.manager>
- Sapo: <https://www.sapo.vn/english-profile>
- Agro-dealer DMS: <https://chartersoftware.com/blog/features-every-agriculture-dealer-management-software-needs/>
- AgroVyapar (fertilizer/pesticide retail): <https://www.agrovyapar.in/>
- Agrohands (billing): <https://www.agrohands.com/>
- PawaPOS (agrovet): <https://pawapos.com/agrovet-pos-software-app-in-kenya/>
