# 49 — Kiểm kê tính năng & lộ trình ý tưởng (Cago / Minh Tuyết)

Tài liệu định hướng sản phẩm: **(1)** toàn bộ tính năng đang có, **(2)** 52 ý tưởng mới chuyên cho
cửa hàng vật tư nông nghiệp nông thôn, **(3)** shortlist top-12 nên làm tiếp. Soạn 2026-06-08.

Quy ước sức: **S** = vài ngày · **M** = 1–2 tuần · **L** = 3+ tuần. "Đối thủ" = KiotViet/Sapo.

---

## PHẦN 1 — Tính năng hiện có (tóm tắt)

Backend Frappe `cago` (~37 module API, 22 DocType riêng) + Next.js (~64 màn hình `/pos`, `(kiosk)`, `/display`).

| Mảng | Đã có |
|---|---|
| **Bán hàng/POS** | tiền/CK/ghi nợ/chia tiền, giảm giá+coupon+đổi điểm, phí giao, FEFO tự gán lô, **bán offline**, trả/đổi hàng, biên lai+in lại, PIN khoá quầy, màn hình phụ CFD, quét mã vạch+in tem |
| **Ca/Két** | mở/đóng ca đếm tiền, thu/chi trong ca, chốt ngày |
| **Kho/Lô/HSD** | nhập hàng (giá vốn+lô+ảnh hoá đơn OCR), nhập hàng loạt, kiểm/điều chỉnh tồn, lô+HSD+FEFO, gợi ý nhập lại, tồn xem nhanh |
| **Công nợ** | ghi nợ/khách trả nợ, sổ nợ+sao kê, danh sách con nợ, hạn mức+chặn lead chưa xác thực, bằng chứng nợ (chữ ký/ảnh), huỷ bút toán |
| **Khách/Điểm** | danh bạ+hồ sơ+lịch sử mua, thêm nhanh tại quầy, giá sỉ theo khách, tích/đổi điểm |
| **NCC/Mua** | danh bạ NCC, nợ NCC+trả NCC+sổ nợ NCC, mua chịu |
| **Sản phẩm/Giá** | tra/sửa giá, tạo/sửa SP+ảnh, **đa đơn vị (Yến/Tạ/Tấn)**, danh mục icon/màu, gộp SP trùng, đánh dấu "nên bán", bản đồ kệ |
| **Báo cáo** | doanh thu kỳ/giờ, cơ cấu thanh toán, bán theo khách, **lãi gộp (chủ)**, bán chạy, digest ngày |
| **Đa kênh** | kiosk khách, đặt hàng từ xa (COD/CK/nợ)+theo dõi đơn, khách tự xem nợ (OTP), gọi người bán, **bot Telegram** (báo cáo+nhắc nợ), **Zalo** OA+đăng nhập khách, VietQR, gửi tin/digest chủ |
| **Trợ lý AI** | chat kiosk/NV/chủ, quản trị FAQ/chip/từ đồng nghĩa, phân tích câu hỏi→FAQ, **lọc an toàn hoá chất**, cấu hình LLM |
| **Vận hành** | sao lưu, kiểm tra go-live, quản lý NV+chức danh/quyền, công tắc cài đặt, hồ sơ cửa hàng |

**Đánh giá:** đã ngang/hơn KiotViet ở table-stakes nông nghiệp (lô-HSD-FEFO, đa đơn vị, công nợ 2
chiều, offline, kiosk, AI an toàn). Khoảng trống lớn = **mùa vụ/nông học**, **tín dụng theo thu
hoạch**, **Zalo Mini App**, **HĐĐT NĐ70/2025**.

---

## PHẦN 2 — 52 ý tưởng mới (theo chủ đề)

### 1. Trí tuệ mùa vụ & nông học (khác biệt cốt lõi — đối thủ KHÔNG có)
1. Lịch mùa vụ địa phương (lúa ĐX/HT, vụ rau, lứa gà/heo) — M
2. "Đến vụ lúa → gợi ý NPK/đạm" + đẩy đầu kiosk theo mùa — M
3. Cảnh báo mùa dịch cây/vật nuôi (đạo ôn, rầy nâu, dịch tả heo) — M
4. Nhắc theo thời tiết (mưa→thuốc nấm; hạn→kali) — M
5. **Máy tính liều dùng theo diện tích/đầu con** (đọc nhãn, không bịa) — M
6. Gói combo theo cây/con ("Gói chăm lúa 1 sào", "Gói úm gà 100 con") — M
7. Hồ sơ ruộng/đàn của khách (DT lúa, số đầu heo/gà) — M
8. Nhắc lịch chăm sóc cá nhân ("7 ngày nữa bón đợt 2") qua Zalo — M

### 2. Tài chính & tín dụng cho nông dân
9. **Nợ theo mùa vụ + hẹn trả sau thu hoạch** (due_date = ngày thu hoạch) — M
10. Aging nợ + **tự nhắc nợ** theo mốc/sau thu hoạch — S–M
11. Điểm tín nhiệm khách (lịch sử trả → hạn mức đề xuất) — M
12. Khất nợ/gia hạn có ghi nhận ("mất mùa") — S
13. Mua trả góp/để dành (layaway) cho máy phun/bình bơm — M
14. Mua chung theo nhóm/xóm → giá sỉ — L
15. Bảng kê nợ in/gửi Zalo cuối tháng — S
16. Lãi suất nợ tuỳ chọn (bật/tắt, theo ngày) — M

### 3. Tăng trưởng & giữ chân khách
17. **Zalo Mini App đặt hàng** — L
18. Hạng thành viên (Đồng/Bạc/Vàng theo doanh số) — S
19. Giới thiệu khách mới được thưởng — M
20. Khuyến mãi sinh nhật/lễ tết tự gửi — S
21. Win-back khách lâu không mua — S
22. Broadcast Zalo/SMS theo phân khúc (chỉ khách nuôi gà / xóm A) — M
23. Báo giảm giá mặt hàng khách theo dõi — M
24. Thẻ khách hàng QR (quét nhận diện + tích điểm) — S

### 4. Giá & mua hàng
25. Bảng giá theo mùa (tự áp lịch) — M
26. So sánh giá nhiều NCC cùng mặt hàng — M
27. Tự sinh đơn đặt hàng (PO) gửi NCC từ gợi ý reorder — M
28. Bám giá đối thủ (chủ nhập giá tham khảo) — M
29. Ký gửi/consignment (NCC để hàng, bán mới trả) — L
30. Giảm giá tự động theo HSD gần (markdown) — M
31. Cảnh báo ứ vốn theo tồn lâu không bán — S

### 5. Trợ lý AI
32. **Hỏi bằng giọng nói** (nông dân gõ tiếng Việt chậm) — M
33. **Chụp ảnh hỏi giá/nhận diện SP** ("chụp bao cám→giá") — M
34. **Chụp lá/sâu bệnh → gợi ý thuốc** (theo nhãn, có cảnh báo) — L
35. Trợ lý chủ động báo chủ ("cám cò sắp hết + 3 khách hay mua→nên nhập") — M
36. Tóm tắt cuộc gọi/đơn đặt → phiếu nháp — M
37. Hỗ trợ tiếng dân tộc/phương ngữ — M
38. Tự đề xuất FAQ từ câu hỏi thực + duyệt 1 chạm — S

### 6. Vận hành & lòng tin
39. **Hoá đơn điện tử (HĐĐT NĐ70/2025)** — L (bắt buộc pháp lý)
40. Định tuyến giao hàng cho xe nhà (gom đơn cùng tuyến) — M
41. App tài xế giao hàng (nhận đơn, xác nhận, thu COD) — L
42. Theo dõi đổi trả/bảo hành giống-cám lỗi — M
43. Truy xuất nguồn gốc theo lô (lô→NCC→khách) — M
44. Tích hợp cân điện tử (cám/phân bán theo cân) — M
45. In tem/mã vạch nâng cao + bảng giá kệ — S
46. Nhiều chi nhánh/cửa hàng — L

### 7. Cộng đồng & khác biệt
47. Bảng hỏi-đáp nông dân (có kiểm duyệt an toàn) — L
48. Đường dây kỹ sư nông nghiệp (câu khó → chuyên gia) — M
49. Vòng phản hồi kết quả mùa vụ ("vụ này NPK X được mấy tạ?") — M
50. Thông tin trợ cấp nhà nước + tích hợp HTX — L

### 8. Chống chịu (offline/no-internet)
51. Đặt hàng qua SMS dự phòng khi mất mạng — M
52. QR catalog in giấy (treo quầy/dán bao → quét xem giá+đặt) — S

---

## PHẦN 3 — TOP 12 NÊN LÀM TIẾP (tác động cao × công sức thấp)

Nguyên tắc: nhiều ý tưởng giá trị cao **chỉ là ghép nối các mảnh đã có** — "trái chín thấp".

| Hạng | Ý tưởng | Sức | Lý do |
|---|---|---|---|
| 1 | **#9 Nợ hẹn trả sau thu hoạch** | M | Bản chất tín dụng nông thôn; thêm field hạn trả vào `debt.record_debt` |
| 2 | **#10 Aging + tự nhắc nợ** | S–M | `telegram._handle_debt_remind` ĐÃ có — chỉ thêm lịch+ngưỡng; thu hồi vốn ngay |
| 3 | **#35 Trợ lý chủ động báo chủ** | M | `assistant_insights`+`reorder_suggestions`+`notify_owner_telegram` đã có, ghép lại |
| 4 | **#15 Bảng kê nợ gửi Zalo cuối tháng** | S | `debt.customer_statement` xong rồi; thêm nút gửi |
| 5 | **#38 Tự đề xuất FAQ + duyệt 1 chạm** | S | `assistant_insights`+`chatbot_admin.draft_faq` gần đủ |
| 6 | **#30 Markdown hàng sắp hết HSD** | S–M | `inventory.expiring_soon` có sẵn; nối `update_price` giảm lỗ huỷ hàng |
| 7 | **#33 Chụp ảnh hỏi giá/nhận diện SP** | M | Vision `bulk._vision_extract` đã chạy; phá rào "khách không biết tên SP" |
| 8 | **#5 Máy tính liều dùng theo nhãn** | M | Câu hỏi #1 của nông dân; `cago_label_instructions`+`safety.py` sẵn, an toàn |
| 9 | **#52 QR catalog in giấy** | S | Tái dùng `(kiosk)/products`+`find_by_barcode`; cầu nối khách lớn tuổi |
| 10 | **#2/#3 Gợi ý NPK theo vụ + cảnh báo dịch** | M | Khác biệt cốt lõi; `set_recommended`+`notify_owner_telegram` |
| 11 | **#18 Hạng thành viên** | S | `cago_points`+`sales_by_customer` đã có; giữ khách trang trại |
| 12 | **#39 Hoá đơn điện tử NĐ70/2025** | L | Sức lớn nhưng rủi ro pháp lý — phải có roadmap; nền `quick_sale`/`get_receipt` sẵn |

**Định hướng:** nhóm **mùa vụ/nông học** (#1–8, #33–34, #49) là khác biệt cạnh tranh thật mà
KiotViet/Sapo không có. **HĐĐT (#39)** là việc bắt buộc phải đưa vào roadmap dù tốn công.
