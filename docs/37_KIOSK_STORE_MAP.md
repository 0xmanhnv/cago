# 37 — Kiosk Store Map & Wayfinding (sơ đồ chỉ đường)

Mô hình "kiosk chỉ đường trung tâm thương mại" thu nhỏ cho cửa hàng vật tư nông nghiệp
Minh Tuyết: màn hình **cố định** → "📍 Bạn đang ở đây" → khu đích **nhấp nháy** → **tuyến
đường gấp khúc chạy dọc lối đi chính** + một dòng chỉ dẫn bằng chữ.

## Quyết định đã chốt (owner, 2026-06-02)
- **Gắn vị trí theo DANH MỤC** (Item Group), không theo từng sản phẩm. Chủ đặt ~8 khối
  danh mục; mọi sản phẩm thừa hưởng vị trí danh mục của nó. (Phase 2 mới thêm ghi đè/SP.)
- **Chỉ đường = đường gấp khúc theo lối đi**: chủ vạch 1 trục lối đi (polyline); tuyến =
  kiosk → vào lối đi → đi dọc lối đi → ra khu đích.
- **Soạn sơ đồ = kéo–thả khối** trên canvas trống (chưa cần ảnh nền — Phase 2).
- **Tùy chọn (progressive enhancement)**: chưa vẽ map → kiosk vẫn hiện `cago_shelf_location`
  dạng chữ như hiện nay; vẽ rồi → hiện nút "📍 Xem vị trí".

## Phát hiện then chốt
Kiosk đứng cố định ⇒ điểm xuất phát luôn = vị trí kiosk ⇒ **KHÔNG cần định vị trong nhà**
(beacon/wifi). Bài toán rút về: vẽ tuyến từ 1 điểm cố định tới khu chứa danh mục.

## Hai điểm xuất phát (kiosk cố định vs điện thoại khách) — bổ sung 2026-06-02
Khách có thể mở bằng **điện thoại** (không đứng ở quầy). Nên map lưu **2 điểm**:
- `kiosk_x/kiosk_y` — "📍 Bạn đang ở đây" (khi chạy trên màn hình kiosk cố định tại quầy).
- `entrance_x/entrance_y` — "🚪 Từ cửa vào" (khi chạy trên điện thoại khách).
Thiết bị tự chọn: cờ `localStorage["cago_fixed_kiosk"]="1"` (đặt 1 lần trên tablet kiosk qua
nút trong trang sơ đồ). Có cờ → xuất phát từ kiosk; không có → từ cửa vào. `computeRoute` nhận
tham số `start`; nhãn điểm đầu đổi theo ("Bạn đang ở đây" / "Từ cửa vào").

## Hệ toạ độ
Chuẩn hoá **0–100** cho cả 2 trục (độc lập độ phân giải). `Cago Store Map.width/height`
giữ tỉ lệ khung cửa hàng (vd 100×70) để SVG `viewBox="0 0 width height"`.

## Mô hình dữ liệu (Frappe)
- **Cago Store Map** (Single):
  - `is_published` Check — bật/tắt hiển thị trên kiosk.
  - `width` Float (mặc định 100), `height` Float (mặc định 70).
  - `kiosk_x`, `kiosk_y` Float — ghim "Bạn ở đây".
  - `zones` Table → **Cago Map Zone**.
  - `aisle` Table → **Cago Map Aisle Point**.
- **Cago Map Zone** (child):
  - `label` Data (VN, vd "Cám chăn nuôi"), `item_group` Link Item Group,
  - `x`,`y`,`w`,`h` Float (0–100), `color` Data (hex), `icon` Data (emoji, tuỳ chọn).
- **Cago Map Aisle Point** (child): `x`,`y` Float (thứ tự theo idx của bảng con).

Khớp sản phẩm ↔ khu: DTO sản phẩm trả `category = item_group`. Tìm zone có
`zone.item_group == product.category` (lấy khu đầu tiên khớp).

## API (`cago/api/storemap.py`)
- `get_store_map()` — `allow_guest=1`. Trả `{published, width, height, kiosk:{x,y},
  aisle:[{x,y}], zones:[{label,item_group,x,y,w,h,color,icon}]}`. **Công khai, không field
  nhạy cảm** (chỉ là bố cục + tên danh mục). Dùng cho cả kiosk và editor của chủ.
- `save_store_map(data)` — `ensure_owner()`. Upsert Single + ghi lại child tables.

Tuyến đường & chỉ dẫn chữ tính **phía client** (kiosk đã có map + category của SP) ⇒ một lần
`get_store_map` phục vụ tất cả, chạy offline tốt.

## Định tuyến (client — `web/src/lib/storemap.ts`)
`computeRoute(map, zone)`:
1. `P` = kiosk; `Z` = tâm khu đích.
2. Nếu có `aisle` (≥2 điểm): chiếu `P`→điểm gần nhất `A` trên polyline; chiếu `Z`→`B`.
   Tuyến = `[P, A, …đoạn polyline A→B…, B, Z]`.
3. Nếu không có lối đi: tuyến gấp khúc đơn giản `[P, (Z.x, P.y), Z]` (đi ngang rồi vào khu)
   — hoặc đường thẳng `[P, Z]` kèm nhãn "sơ đồ tham khảo".
`routeHint(map, zone)` → câu tiếng Việt từ hình học: trái/phải/đi thẳng/phía sau +
khoảng cách (gần/giữa/cuối) + nhãn khu. Vd: "Bên phải, đi tới cuối lối đi — kệ Cám 🐔".

## UX chủ — `/owner/map` (`StoreMap` editor)
Canvas SVG khung cửa hàng. Thanh công cụ:
- **➕ Thêm khu** → chọn Item Group → khối chữ nhật xuất hiện, kéo để di chuyển, kéo góc để
  chỉnh kích thước; chạm khối → đổi nhãn/màu/icon/xoá.
- **📍 Đặt "Bạn ở đây"** → kéo ghim kiosk.
- **🛤 Vẽ lối đi** → chạm để thêm điểm polyline; kéo điểm; xoá.
- **💾 Lưu** → `save_store_map`. Pointer-events tự xử lý, không thư viện nặng.
Vào từ tile mới ở `OwnerHome`.

## UX khách — kiosk
- Route mới `/(kiosk)/map`: hiện cả sơ đồ; chạm 1 khu → mở danh sách SP của danh mục đó
  (tái dùng ProductList lọc theo category).
- Trang chi tiết SP: nút **"📍 Xem vị trí"** (chỉ hiện khi map published & danh mục có khu)
  → mở sơ đồ: khu đích nhấp nháy, ghim "Bạn ở đây", tuyến (nét đứt + chấm chạy động), 1 dòng
  chỉ dẫn chữ. Không có khu khớp → fallback hiện `shelf_location` như hiện tại.

## Offline / PWA
Cache `get_store_map` + thêm `/map` vào danh sách cache của service worker.

## Phân kỳ
- **Phase 1 (MVP):** 3 DocType + API get/save + editor kéo–thả + view kiosk + seed 1 map.
- **Phase 2 (2026-06-02):** đa tầng + UX editor (16 màu + lưới icon) + điều hướng (bản này).
- **Sau này:** ghi đè vị trí theo từng SP, ảnh nền sơ đồ vẽ tay, đồ thị waypoint nhiều nhánh.

## Phase 2 — Đa tầng + UX (đã làm)
Cửa hàng thật **2 tầng** (Tầng 1 + Tầng hầm), mỗi tầng có **dãy** 2 bên một **lối đi giữa**,
**cầu thang** nối tầng, **cửa** ở Tầng 1.
- **`Cago Map Floor`** (con): `label`, `level` (số lớn = tầng trên), `stairs_x/_y`. Zone + Aisle
  thêm field `floor`. Store Map thêm `floors` + `kiosk_floor` + `entrance_floor`. Dùng chung canvas.
- **`planRoute` xuyên tầng**: cùng tầng → start→lối đi→khu. Khác tầng → start→🪜 (tầng xuất phát),
  rồi 🪜→khu (tầng đích) + câu "Đi tới cầu thang, **xuống/lên** {tầng}…" (suy từ `level`).
- **Editor**: tab tầng, thêm/xoá/đổi tên + cao độ, 🪜 kéo được mỗi tầng, nút đặt kiosk/cửa ở tầng;
  **16 màu** + **lưới chọn icon emoji** (bấm, không gõ); khoá kéo khi vẽ lối đi; key ổn định;
  chặn ghi điểm (0,0) khi CTM null; giữ khu dù xoá nhãn (placeholder).
- **Kiosk**: tab tầng (đích gắn 🎯), chỉ vẽ tầng đang xem; báo "khu chưa đánh dấu"; seed demo 2 tầng.

## Điều hướng kiosk — "Back vs Home" (component `KioskNavButtons`)
Hai ý định tách bạch, **luôn hiện cùng lúc** mọi màn:
- **‹ Quay lại**: lùi đúng màn trước (history-aware `useKioskNav.goBack`, cờ `cago_nav`; fallback khi
  vào sâu trực tiếp). Sửa edge-case: map → danh mục → Quay lại → **về map** (trước phải về trang chủ).
- **🏠 Trang chủ**: về đầu 1 chạm (khách lạc/mới). Chip đổi danh mục dùng `router.replace` (không
  chất đống history). Áp dụng: ProductList, ProductDetail, Map, Cart, MyDebt.

## Lưới "Cần giúp đỡ?" — chống thẻ lẻ
Cột theo số thẻ: ≤3 → 1 hàng (cols=count, vd 3→hàng 3); 4 → 2×2; ≥5 → mỗi hàng 3 (5→3+2). Hết cảnh
3 thẻ rớt 1 cái xuống dưới.

## Rủi ro & giảm thiểu
- Chủ không duy trì → mức danh mục (ổn định, ~8 khối) + tùy chọn + sửa nhanh.
- Sai vài mét → nhãn "sơ đồ tham khảo".
- Không bao giờ lộ giá vốn/tồn/nhạy cảm: DTO map chỉ có bố cục + tên danh mục.
