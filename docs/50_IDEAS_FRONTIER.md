# 50 — Ý tưởng "biên giới" mở rộng (≈140 ý tưởng mới ngoài docs/49)

Tiếp nối `docs/49_ROADMAP.md` (52 ý tưởng). Bốn biên giới được đào sâu, mỗi cái ~30+ ý tưởng MỚI
không trùng docs/49: **(I) Nông học & đời sống nhà nông · (II) Fintech/B2B/SaaS · (III) AI-native/IoT/
dữ liệu · (IV) Trải nghiệm/cộng đồng/dễ-tiếp-cận**. Mọi "xây trên" đã đối chiếu mã nguồn thật.

Quy ước: **S** vài ngày · **M** 1–2 tuần · **L** 3+ tuần. ⭐ = đột phá/khác biệt sâu. 🟢 = chạy offline.

---

## I. NÔNG HỌC & ĐỜI SỐNG NHÀ NÔNG (đối thủ về cấu trúc không thể sao chép)

**Chăn nuôi:** Sổ FCR theo đàn (M) · Lịch vaccine/tẩy giun theo đàn + nhắc (M) · Bảng pha thuốc qua
nước uống theo đầu con (M, qua safety.py) · Combo úm→vỗ béo→xuất chuồng (M) · Sổ năng suất trứng/sữa
↔ loại cám (M) · ⭐Bộ an toàn sinh học dịch tả/cúm (M) · Nhắc cai sữa/chuyển cám (S–M) · Cảnh báo rét/nóng→điện giải (S–M).

**Canh tác:** ⭐**Xoay vòng hoạt chất chống kháng thuốc** (M — field hoạt chất + lịch sử mua) · Sổ cách
ly (PHI) theo ruộng (M) · Ngưỡng IPM (M) · Hướng dẫn pH/dinh dưỡng đất (M) · ⭐Bảng so màu lá lúa (LCC)→đạm
(S–M, logic tĩnh) · Sổ tỉ lệ nảy mầm theo lô giống (M) · Lịch tưới theo cây+thời tiết (M) · Lịch bón theo
giai đoạn sinh trưởng (S–M).

**Vòng đời & kinh tế hộ:** ⭐**Tag "vụ/lứa" cho mỗi đơn** (S — mở khoá mọi báo cáo theo vụ) · ⭐Sổ chi phí
theo sào/đàn → lãi/sào (L) · Benchmark đầu-vào→năng-suất ẩn danh (L) · "Vụ trước mua gì" 1 chạm (S–M).

**Rủi ro & chứng nhận:** Bộ ứng phó thiên tai (M) · Feed giá lúa/heo/gà→định thời thu nợ (M) · Móc nối
bảo hiểm NN (M) · Nhận biết phiên chợ vùng (S) · Cảm biến cầu cấp xóm (M) · Hỗ trợ VietGAP/hữu cơ + xuất
nhật ký vật tư (L) · Cảnh báo MRL/hoạt chất cấm trên cây xuất khẩu (M) · Phát hiện thuốc giả (M) · Nội dung
khuyến nông nhúng kiosk (M) · Đường dây kỹ sư + bot lọc câu khó (M) · Lịch mùa vụ theo dân tộc/vùng (M).

**Nền AI nông học:** ⭐Đồ thị cây–sâu bệnh–hoạt chất–sản phẩm (L) · Tool nông học cho trợ lý
(M — `chatbot/tools.py`) · Vòng phản hồi kết quả→tinh chỉnh gợi ý (M).

---

## II. FINTECH · B2B · MÔ HÌNH KINH DOANH (scale play thật)

**Embedded finance:** Chấm điểm tín dụng nội bộ (M) · Tự đề xuất & nới hạn mức (M, dùng `lock_customer`) ·
BNPL kỳ hạn cấu trúc (M) · ⭐Vay vật tư đầu vụ trả khi gặt (L) · Engine lãi/phí phạt (M) · Tái cơ cấu nợ khi
mất mùa (M) · ⭐Bảo lãnh nhóm/xóm (L, dùng witness của debt_proof) · Két tiết kiệm/ký quỹ mua vật tư (M) ·
Bán chéo bảo hiểm vi mô (M ⚠️giấy phép).

**Chuỗi cung ứng/B2B:** Gom cầu xóm→đơn sỉ (M, dùng wanted_list) · Tài trợ ký gửi có dòng tiền (L) · Mua
thẳng nhà máy (M) · Logistics dùng chung shop lân cận (L) · Chỉ số giá mua tham chiếu (M) · Dropship món
hiếm (M) · ⭐⭐**Bao tiêu đầu ra & cấn trừ nợ** (L — đóng vòng tiền sau thu hoạch) · Bao thanh toán/factoring (L ⚠️).

**Mô hình/Monetization:** ⭐⭐**Cago SaaS đa-tenant** bán cho 50.000 shop vật tư VN (L) · Franchise/white-label
(M) · Phí giao dịch/tài trợ (M) · Mạng mua chung giữa shop (L) · Bán tín hiệu dữ liệu NN ẩn danh (M ⚠️PDPD) ·
⭐Quảng cáo brand trong kiosk (S — Con Cò/Cargill) · Gói phân tích cao cấp (M) · Thị trường tài chính nhúng (L ⚠️).

**Dòng tiền cho chủ:** ⭐**Dự báo dòng tiền theo mùa** (M — phải-thu theo ngày gặt vs phải-trả NCC) · Cảnh
báo vốn lưu động (S–M) · Cố vấn "có nên nhập không?" (M) · Kế hoạch vốn theo mùa (M) · ⭐**Bảng "tiền thật"
của shop** (S — gộp két+NH−nợ NCC+phải thu).

**Rủi ro tín dụng:** Bảng nợ theo nhóm rủi ro Xanh/Vàng/Đỏ (S) · Giới hạn exposure tập trung theo vụ (M) ·
Phát hiện gian lận nợ (M, dùng owner_action_log).

> ⚠️ **Pháp lý:** khung mọi tín dụng là **bán chịu thương mại / chiết khấu trả sớm**, KHÔNG marketing "cho
> vay lãi" (trần 20%/năm BLDS Đ.468 + luật TCTD). Bảo hiểm/factoring/cho-vay-quy-mô → qua **đối tác được cấp phép**.

---

## III. AI-NATIVE · IoT · HIỆU ỨNG MẠNG DỮ LIỆU

**Dự báo/ML:** Dự báo cầu từng mặt hàng theo tuần (L, 🟢infer local) · Tự tính SỐ LƯỢNG đặt lại + sinh PO
(M, 🟢) · Cảnh báo hết hàng/ế trước 2 tuần (M, 🟢) · Markdown động theo HSD (M, 🟢) · Dự báo churn trang trại
(M) · Gợi ý SP kế tiếp tại quầy (M) · ⭐Phát hiện bất thường két/kho (M, 🟢) · Học co giãn giá (L) · Điểm tín
dụng theo mùa (M, trùng II — nền chung).

**UX AI-native:** ⭐POS hội thoại "bán anh Ba 2 bao cám ghi nợ" (L) · Nhập kho bằng giọng (M) · ⭐⭐**Số hoá
QUYỂN SỔ NỢ viết tay từ ảnh** (M — tái dùng `bulk._vision_extract`) · Bot trực điện thoại cửa hàng (L) · Agent
đặt hàng qua Zalo/Telegram (M) · TTS/STT phương ngữ + đọc kết quả (M) · Tóm tắt cuối ngày bằng giọng (S) ·
Điền hồ sơ ruộng/đàn bằng hội thoại (S).

**Thị giác máy:** Chụp kệ→tự đếm tồn (L) · Nhận diện SP không cần mã vạch (M) · Phát hiện tem giả/hết hạn (L) ·
Cân-bằng-ảnh ước trọng lượng (L) · OCR tờ rơi/giá đối thủ (M) · Đọc phiếu cân/giao NCC (M).

**IoT/phần cứng rẻ:** ⭐Cân Bluetooth→tự điền kg (M, 🟢) · In nhiệt sâu + mở ngăn kéo tiền ESC/POS (M) · Súng
quét mã vạch $10 (S) · Cảm biến nhiệt-ẩm kho hoá chất (M) · Khoá tablet kiosk lockdown (S) · UPS+cảnh báo pin/tự
lưu ca (M) · Nút cứng "Gọi người bán" ESP32 (S).

**Mạng dữ liệu (cần multi-tenant):** Benchmark giá ẩn danh theo vùng (L) · Tín hiệu cầu gộp lên NCC (L) ·
⭐Đồ thị tri thức nông học chung (L) · FAQ liên-cửa-hàng (M) · Cảnh báo dịch/hàng giả theo vùng (M) · Chuẩn
hoá SKU master (L).

**AI biên/offline:** ⭐Model nhỏ on-device dự phòng khi mất LLM (L, 🟢 — `providers/` đã trừu tượng) · Embeddings
cache tìm SP & Q&A offline (M, 🟢) · ⭐Ưu tiên câu trả lời xác định khi offline (S, 🟢 — `deterministic.py` đã có) ·
Hàng đợi câu hỏi AI offline→trả khi có mạng (M) · Gói tri thức nông học tải sẵn (M, 🟢).

---

## IV. TRẢI NGHIỆM · CỘNG ĐỒNG · DỄ TIẾP CẬN · CHỐNG CHỊU

**Dễ tiếp cận (người ít chữ/lớn tuổi):** ⭐"Đọc nợ cho tôi nghe" TTS (M) · Điều hướng chỉ-icon+giọng (M) ·
"Mua như lần trước" 1 chạm (S) · Duyệt SP bằng ảnh không chữ (S) · Biên lai chữ-to/đọc to (S) · ⭐Màu đèn giao
thông cho công nợ (S) · ⭐Tài khoản người thân (con xem nợ hộ bố mẹ) (M) · Trợ lý nghe-nói toàn phần kiosk (M).

**Cộng đồng:** ⭐Bảng tin xóm trên kiosk (giá lúa/heo, lịch tiêm, cắt điện) (M) · Bảng vàng mùa vụ xóm (M) ·
Đồ thị tin cậy giới thiệu hàng xóm (M) · Nhóm theo cây/đàn (M) · Câu chuyện thành công nông dân (S) · Bảng nhắn
đổi-công/tìm-đồ/báo-đám (M) · Lịch sự kiện xóm + nhắc gói quà (S).

**Tăng trưởng:** Chuỗi mùa vụ (streak)→quà (M) · Quà bất ngờ tại quầy (S) · "Khách VIP của tháng" (S) · Lì
xì/cào trúng Tết (S, dùng coupon engine) · Cross-promo thú y/lái lúa (M) · Win-back theo nông học cá nhân (M).

**Minh bạch/lòng tin:** ⭐Bảng giá công khai chống nói thách (S) · ⭐Sổ nợ mở khách tự đối soát (S) · QR chống
hàng giả theo lô (M) · Đánh giá lời khuyên của shop (M) · Cam kết "đúng hàng đúng giá" (S).

**Chống chịu & kế thừa:** ⭐Chế độ "chủ ốm" cấp quyền tạm có hạn dùng (M) · Cẩm nang mất điện/mạng trong app
(S) · Dashboard chủ trên điện thoại (M) · ⭐"Sức khoẻ cuối ngày 1 ánh nhìn" (S) · Báo mất hàng/hao hụt (S) ·
Quiz huấn luyện NV (an toàn hoá chất) (M) · Màn xem nhật ký thao tác (audit) (S) · Đồng bộ nhiều thiết bị (M).

**Giao hàng xe nhà:** Khách tự chọn khung giờ giao (S) · ⭐Ảnh bằng chứng giao hàng (S) · Gom chuyến theo xóm
(M) · Đối soát COD cuối chuyến (S) · Hẹn lấy hàng đổi-trả (S).

---

## ⭐ MASTER SHORTLIST — 24 việc nên làm, xếp 3 SÓNG

Lọc trùng + chấm **tác động × khả thi** trên toàn bộ docs/49 + docs/50. Ưu tiên thứ **ghép từ mảnh đã có**.

### SÓNG 1 — Trái chín thấp, không cần đối tác (làm trước, ROI nhanh)
| Việc | Sức | Vì sao | Xây trên |
|---|---|---|---|
| **Số hoá sổ nợ viết tay từ ảnh** | M | Cú hích "giấy→app" lớn nhất | `bulk._vision_extract`+`debt.record_debt` |
| **Bảng "tiền thật" + Sức khoẻ cuối ngày 1 ánh nhìn** | S | Chủ ít tech cần 1 con số | `shift`+`payment_split`+outstanding |
| **Dự báo dòng tiền theo mùa** | M | Pain số 1 của chủ | ledger phải-thu/phải-trả + due-date |
| **Màu đèn giao thông công nợ + Sổ nợ khách tự đối soát** | S | Người ít chữ đọc được; giảm tranh chấp | `debt._debt_summary`/`get_customer_ledger`+`debt_proof` |
| **"Đọc nợ cho tôi nghe" (TTS)** | M | Phá rào người lớn tuổi | `MyDebt`/`customer_statement`+TTS |
| **Tag "vụ/lứa" cho mỗi đơn** | S | Mở khoá báo cáo theo vụ (nền cho lãi/sào) | field trên Sales Invoice |
| **Tự tính số lượng đặt lại + sinh PO** | M | Cứu vốn, chống hết hàng giữa vụ | `reorder_suggestions`+`supplier`+notify |
| **Markdown động theo HSD** | M | Biến hàng huỷ-lỗ thành doanh thu | `expiring_soon`+`update_price` |
| **Ưu tiên trả lời xác định khi offline** | S | Bot không "chết" khi rớt mạng | `chatbot/deterministic.py` |
| **Nợ hẹn trả sau thu hoạch + tự nhắc nợ** (từ docs/49 #9/#10) | S–M | Bản chất tín dụng nông thôn | `telegram._handle_debt_remind` |

### SÓNG 2 — Khác biệt cạnh tranh sâu (đối thủ không có)
| Việc | Sức | Vì sao |
|---|---|---|
| **Xoay vòng hoạt chất chống kháng thuốc** | M | Khác biệt nông học sâu nhất; cứu mùa cho khách |
| **Chấm điểm tín dụng → tự nới hạn mức** | M | Dữ liệu mua–trả → quyết định tín dụng tự động |
| **POS hội thoại (bán bằng câu nói)** | L | Phá rào low-tech tận gốc |
| **Sổ chi phí theo sào/đàn → lãi/sào** | L | Shop thành "kế toán đồng ruộng" → trung thành khó rời |
| **Lịch vaccine/an toàn sinh học theo đàn** | M | Đánh đúng nỗi sợ "cả đàn chết" |
| **Bảng tin xóm + bảng giá công khai** | M | Biến shop thành điểm ghé hằng ngày; lòng tin |
| **Cân Bluetooth + ảnh bằng chứng giao hàng** | M | Hoàn thiện nghiệp vụ lõi (bán cân, giao xe nhà) |
| **Chế độ "chủ ốm" cấp quyền tạm** | M | Rủi ro tồn tại của shop một-chủ |
| **AI biên on-device dự phòng + chụp ảnh nhận diện SP** | L | Rural-first; tái dùng Vision đã chạy |

### SÓNG 3 — Quy mô / cần đối tác / giấy phép (kế hoạch dài hạn)
| Việc | Vì sao | Cần |
|---|---|---|
| ⭐⭐**Cago SaaS đa-tenant** (bán cho shop vật tư khác) | Scale play thật — 50.000 shop VN | đầu tư + tách company-scoping |
| ⭐⭐**Bao tiêu đầu ra & cấn trừ nợ** | Đóng vòng tiền sau thu hoạch | kênh thu mua nông sản |
| **Vay vật tư đầu vụ trả khi gặt (BNPL)** | Tín dụng nông nghiệp đúng nghĩa | khung "bán chịu", tránh trần lãi |
| **Mạng dữ liệu liên-shop** (benchmark giá, đồ thị tri thức, cảnh báo dịch vùng) | Moat lớn nhất | cần nhiều tenant (sau SaaS) |
| **HĐĐT NĐ70/2025** (docs/49 #39) | Bắt buộc pháp lý | nhà cung cấp HĐĐT |
| **Bảo hiểm vi mô / factoring / kênh tài chính** | Bảo vệ khách + khoản phải thu | đối tác được cấp phép |

---

**Kết:** Phần lớn giá trị nằm ở **Sóng 1** — gần như chỉ ghép API/DocType đã có (`bulk._vision_extract`,
`reorder_suggestions`, `expiring_soon`, `deterministic.py`, `debt_proof`, `_handle_debt_remind`, `shift`).
Hào cạnh tranh dài hạn là **nông học sâu** (xoay vòng hoạt chất, lãi/sào, đồ thị cây–sâu–thuốc) + **đóng
vòng tiền** (offtake/BNPL) + **SaaS đa-tenant** — những thứ KiotViet/Sapo về cấu trúc không phục vụ được
cho nông thôn. An toàn hoá chất + pháp lý tín dụng là ràng buộc cứng xuyên suốt.
