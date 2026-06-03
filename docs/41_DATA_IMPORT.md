# 41 — Nhập dữ liệu ban đầu (Excel/CSV → ERPNext + Cago)

Cách đổ catalog sản phẩm thật vào hệ thống khi mới triển khai. Dùng bộ nhập có sẵn của Cago
(`cago.setup.sample_data.import_sample_products`) — **idempotent**: chạy lại cập nhật theo
`item_code`, không tạo trùng.

## 1. Chuẩn bị file CSV
Xuất từ Excel/Google Sheets ra **CSV UTF-8**. Header (cột) — chỉ `item_code` là bắt buộc:

| Cột | Ý nghĩa |
|---|---|
| `item_code` | **Mã duy nhất** (vd `CAM-GA-CON-25KG`). Khoá để upsert. |
| `item_name` | Tên chính thức |
| `item_group` | Nhóm hàng (tự tạo nếu chưa có) |
| `stock_uom` | Đơn vị tồn (Bao, Kg, Chai…) — tự tạo nếu chưa có |
| `selling_price` | Giá bán / đơn vị tồn (số, VND, không dấu chấm) |
| `cago_display_name` | Tên hiển thị cho khách |
| `cago_local_names` | Tên dân dã (khách hay gọi) — giúp tìm kiếm |
| `cago_public_description` | Mô tả công khai |
| `cago_use_cases` | Dùng cho |
| `cago_crop_or_animal_targets` | Cây/con phù hợp |
| `cago_staff_advice` | Câu tư vấn cho nhân viên |
| `cago_package_color` | Màu bao bì |
| `cago_shelf_location` | Vị trí kệ |
| `cago_stock_status_manual` | Trạng thái tồn hiển thị (khi không tự tính) |
| `cago_safety_notes` | Lưu ý an toàn |
| `cago_is_chemical` | 1/0 — là hoá chất/thuốc |
| `cago_is_public_visible` | 1/0 — hiện trên kiosk |

> Mẫu thật: `frappe-apps/cago/cago/data/sample_products.csv`. Copy header của file này rồi điền.

## 2. Chạy nhập
Đặt file vào nơi container đọc được (vd `sites/`), rồi:
```bash
docker compose exec backend bench --site <site> execute \
  cago.setup.sample_data.import_sample_products \
  --kwargs "{'csv_path': '/home/frappe/frappe-bench/sites/products.csv'}"
```
- Tự tạo Item Group + UOM còn thiếu, upsert Item + đặt Item Price (giá bán).
- In `created/updated` từng dòng. Chạy lại an toàn (cập nhật theo `item_code`).

## 3. Việc KHÔNG nằm trong bước này (làm sau, trong app)
- **Số lượng tồn thực**: nhập qua **📥 Nhập hàng** / **⚡ Nhập hàng loạt** (tạo Material Receipt + giá vốn). CSV chỉ đặt giá bán, không set tồn.
- **Ảnh sản phẩm**: tải trong **📦 Sản phẩm → sửa** (hoặc API `owner.add_product_image`).
- **Lô & hạn dùng (FEFO)**: thêm khi nhập hàng (batch + HSD).
- **Đa đơn vị bán / giá sỉ / khuyên dùng ⭐**: đặt trong màn sửa sản phẩm.
- **Khách hàng & công nợ đầu kỳ**: thêm khách trong app; nợ đầu kỳ ghi qua **Ghi nợ**. (Khối lượng lớn: cân nhắc Frappe **Data Import** chuẩn cho doctype Customer.)
- **Nhà cung cấp**: thêm trong **Công nợ NCC**.

## 4. Mẹo & kiểm tra sau nhập
- Mã `item_code` đặt theo quy tắc gợi nhớ (LOẠI-TÊN-QUYCÁCH) để sửa/đối soát dễ.
- Sau khi nhập: vào **🩺 Kiểm tra dữ liệu** để bắt **thiếu giá / thiếu ảnh / trùng tên / chưa phân loại** rồi dọn.
- Sai hàng loạt? Sửa CSV → chạy lại lệnh (upsert ghi đè).
- Dữ liệu lớn/đa doctype: có thể dùng **Frappe Data Import** (Desk `/app/data-import`) cho Item/Customer, nhưng bộ trên đã set sẵn custom field Cago + giá nên tiện hơn cho sản phẩm.

> Trước khi nhập hàng loạt lần đầu trên dữ liệu thật: **sao lưu** (Cài đặt → 💾 Sao lưu dữ liệu).
