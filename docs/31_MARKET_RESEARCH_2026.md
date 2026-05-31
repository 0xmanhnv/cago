# 31 — Nghiên cứu thị trường (2026) — phần mềm + sản phẩm vật tư nông nghiệp VN

> Deep‑research đa nguồn, có đối chiếu/kiểm chứng (19/25 claim được xác nhận, 6 bị bác bỏ).
> **Giá là ảnh chụp một thời điểm, biến động mạnh — chỉ dùng tham khảo, không hardcode.**
> Nguồn nhà cung cấp là trang marketing (tự công bố): "có tính năng" đáng tin, còn các
> tính từ "tự động/tốt nhất/minh bạch" nên trừ hao.

## 1. Đối thủ phần mềm (xác nhận có gói chuyên vật tư NN)
**KiotViet, MISA eShop, POS365** đều có gói riêng cho cửa hàng phân bón/thuốc BVTV/vật tư NN.
Giá (chỉ những con số sống sót kiểm chứng): **POS365 ~92.000đ/tháng** (có cả mua đứt),
**MISA eShop "từ 199.000đ/tháng"** (bậc 99k/299k/699k), **KiotViet "từ 8.000đ/ngày"**.
*(Các giá KiotViet 180–250k, Sapo 160–599k, MISA 100k từ blog amis.misa.vn đã bị bác bỏ 0‑3 — không dùng.)*

**Mặt bằng tính năng (table‑stakes, phải có — không phải lợi thế):**
- POS bán hàng, tồn kho cảnh báo tức thời, barcode, báo cáo lãi/lỗ (MISA "40 báo cáo").
- **Đa đơn vị + quy đổi + giá theo đơn vị** (KiotViet nêu đúng nỗi đau "hộp/lốc/thùng").
- **Lô + hạn sử dụng + FEFO** (xuất lô hết hạn trước, cảnh báo vàng/đỏ) — KiotViet, MISA (tới 40.000 mã).
- **Công nợ** chi tiết theo từng khách/nhà cung cấp/sản phẩm/ngày, nhắc nợ, hạn mức nợ (KiotViet);
  thu + phải trả NCC (MISA); phục vụ đúng tập quán "bán chịu/gối đầu" nông thôn.
- **Hóa đơn điện tử** (tuân thủ Thuế), chấm công nhân viên, quản lý từ xa qua điện thoại.
- **Thanh toán không tiền mặt**: Mobile Banking, thẻ, ví, **QR** (POS365).

Nguồn: kiotviet.vn (gói phân bón‑thuốc trừ sâu; bài ra mắt lô‑HSD), misaeshop.vn/9858,
pos365.vn/...6230, qtsoftware.vn, easypos.vn.

## 2. Đối chiếu Cago — đã ngang hàng ở đâu, thiếu gì
| Tính năng (table‑stakes) | Cago | Ghi chú |
|---|---|---|
| POS bán hàng | ✅ native ERPNext | |
| Đa đơn vị + giá theo đơn vị (bán lẻ kg/lạng) | ✅ **vừa làm** | ngang đối thủ |
| Lô + hạn dùng + cảnh báo | ✅ (Batch) | **thiếu FEFO auto‑gợi ý lô bán trước** |
| Công nợ khách + sổ + nhắc (Zalo draft) | ✅ | **thiếu: NCC phải trả, nợ theo sản phẩm, hạn mức nợ** |
| Tồn kho thật + tự trạng thái + gợi ý nhập | ✅ **vừa làm** | |
| Báo cáo (kỳ, bán chạy, tách tiền, sắp hết) | ✅ | thiếu lãi gộp (cần giá vốn) |
| Chặn bán dưới giá vốn | ✅ **vừa làm** | đối thủ không nêu — điểm cộng |
| Barcode + quét mã | ❌ | **gap** (đối thủ có; native POS quét được Item Barcode) |
| Hóa đơn điện tử (Thuế) | ❌ | **gap tuân thủ** (cần nhà cung cấp HĐĐT VN) |
| Thanh toán QR (VietQR/MoMo/ZaloPay) | ⚠️ một phần | native POS có mode; chưa tích hợp QR thật |
| Loyalty/khách thân thiết, dashboard di động | ❌ | P2 |

**Lợi thế khác biệt của Cago (đối thủ KHÔNG thấy có — cơ hội):** UI tách vai trò
owner/staff/**kiosk khách tự phục vụ**, **trợ lý AI tư vấn + cảnh báo an toàn hóa chất**,
đơn giản tiếng Việt cho người ít rành công nghệ. (Nghiên cứu không tìm thấy đối thủ nào có
kiosk/AI/Zalo‑loyalty rõ ràng → nên giữ và làm mạnh.)

## 3. Xu hướng & công nghệ
- **QR/không tiền mặt tăng mạnh** (VietQR 9T‑2023 +8 lần số lượng/+4 lần giá trị; QR chung
  +105% số lượng — SBV/NAPAS). → nên hỗ trợ VietQR/MoMo/ZaloPay.
- Loyalty + quản lý từ xa qua di động phổ biến.
- Bán chịu/mùa vụ là đặc thù nông thôn (đối thủ phục vụ qua công nợ).
Nguồn: baophapluat.vn (VietQR), vietnamplus.vn (AI/loyalty retail), pos365.vn.

## 4. Catalog & đơn vị bán & giá tham khảo (sát thực tế VN)
**Danh mục nên có:** Cám/Thức ăn chăn nuôi · Phân bón (vô cơ/hữu cơ) · Thuốc BVTV (sâu/bệnh) ·
Thuốc cỏ · Thuốc chuột · Giống · Dụng cụ.

**Đơn vị bán & quy đổi (khớp tính năng đa đơn vị):**
- Cám: **bao 25kg ↔ kg** (Cargill/CP/De Heus/GreenFeed/Con Cò — quy cách bao 25kg phổ biến).
- Phân vô cơ (urea/NPK): **bao 50kg ↔ kg**; hữu cơ: **bao 40kg/25kg/2kg/1kg ↔ kg**.
- Thuốc BVTV/cỏ/chuột: **chai/gói/ml/g** (lô + HSD bắt buộc).
- Giống: **gói/kg**.

**Khoảng giá tham khảo (sfarm.vn, 31/05/2026 — BIẾN ĐỘNG, theo vùng/tuần):**
- Urea 50kg ~**540k–660k** (miền Bắc thấp hơn; ĐNB/Tây Nguyên cao hơn).
- NPK 16‑16‑8 50kg ~**660k–760k**; NPK 20‑20‑15+TE Bình Điền ~**890k–930k**.
- Phân hữu cơ trùn quế: 2kg **26–29k** · 25kg **239–249k** · 40kg **369–379k**.
- Phân gà: 1kg **22–25k** · 25kg **263–273k**.
> ⚠️ Giá urea/NPK 1,2–1,7 triệu/bao từ nongnghieppho.vn đã **bị bác bỏ 0‑3** (phi thực tế) — KHÔNG dùng.
> ⚠️ **Chưa xác minh** giá/đơn vị **cám** (Con Cò/Cargill/CP/De Heus/GreenFeed) và **thuốc BVTV/chuột/cỏ**
> (hãng, hoạt chất, chai/gói) → cần khảo trực tiếp tại cửa hàng trước khi seed.

## 5. Kết luận — tính năng nên ưu tiên cho Cago
- **P1 (đóng gap so với đối thủ, ít rủi ro):**
  - **Barcode + quét mã** (tra/bán nhanh; native POS quét sẵn) — nhỏ, giá trị cao.
  - **Công nợ nhà cung cấp (phải trả)** + **hạn mức nợ khách** + nhắc nợ — mở rộng module nợ.
  - **FEFO**: khi bán/nhắc, gợi ý lô **hết hạn trước** (đã có Batch+HSD, chỉ thêm sắp xếp/gợi ý).
- **P1 nhưng cần quyết định/đối tác:**
  - **Hóa đơn điện tử** (tuân thủ Thuế) — cần tích hợp nhà cung cấp HĐĐT VN (Viettel/VNPT/MISA…); đáng kể.
  - **Ghi nợ → hoá đơn bán chịu trừ tồn** (đã treo) — cần thiết để công nợ khớp tồn + có lãi gộp.
- **P2:** Thanh toán **QR (VietQR/MoMo/ZaloPay)**, loyalty/khách thân thiết, dashboard di động cho chủ.
- **Giữ & làm mạnh khác biệt:** kiosk khách, trợ lý AI an toàn hóa chất, UI tách vai trò.

## Nguồn chính
- KiotViet: <https://www.kiotviet.vn/phan-mem-quan-ly-ban-hang-cua-hang-phan-bon-thuoc-tru-sau/> · lô‑HSD: <https://www.kiotviet.vn/phan-mem-quan-ly-kiotviet-ra-mat-tinh-nang-quan-ly-hang-hoa-theo-lo-va-han-su-dung/>
- MISA eShop: <https://www.misaeshop.vn/9858/phan-mem-quan-ly-cua-hang-vat-tu-nong-nghiep/>
- POS365: <https://pos365.vn/phan-mem-quan-ly-ban-vat-tu-nong-nghiep-6230.html>
- Giá phân bón: <https://sfarm.vn/bang-gia-phan-bon-hom-nay-phan-vo-co-huu-co-sll1/>
- QR/thanh toán: <https://baophapluat.vn/thanh-toan-bang-phuong-thuc-quet-vietqr-tang-8-lan-ve-so-luong-va-4-lan-ve-gia-tri-post496053.html>
- Xu hướng AI/loyalty: <https://www.vietnamplus.vn/agent-ai-social-commerce-va-loyalty-bo-ba-tang-truong-moi-cho-retail-fmcg-fb-viet-nam-post1099969.vnp>

*Caveat: phần lớn tính năng/giá đối thủ từ trang marketing; giá vật tư là snapshot biến động;
giá cám & thuốc chưa có nguồn xác minh.*
