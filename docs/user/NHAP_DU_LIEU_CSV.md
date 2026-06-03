# Hướng dẫn nhập sản phẩm bằng CSV (go-live)

File mẫu: `products_import_template.csv`. Hoặc dùng **catalog dựng sẵn sát thị trường**: `catalog_minh_tuyet.csv` (rà + sửa giá theo cửa hàng rồi nạp). Nạp catalog **không** tạo tồn kho — nhập tồn riêng ở **Nhập hàng**. Mở bằng Excel / Google Sheets, **giữ nguyên hàng tiêu đề**,
điền sản phẩm thật vào các hàng bên dưới, rồi lưu lại dạng **CSV UTF-8**.

## Ý nghĩa từng cột

| Cột | Bắt buộc | Ý nghĩa | Ví dụ |
|---|---|---|---|
| `item_code` | ✅ | Mã sản phẩm, **duy nhất**, không dấu/không cách (dùng `-`). Là khóa để cập nhật. | `CAM-CO-GA-CON-25KG` |
| `item_name` | ✅ | Tên đầy đủ | `Cám cò gà con 25kg` |
| `item_group` | ✅ | Nhóm/danh mục (gõ đúng tên; chưa có sẽ tự tạo) | `Cám chăn nuôi`, `Phân bón`, `Thuốc bảo vệ thực vật`, `Hạt giống`, `Dụng cụ` |
| `stock_uom` | ✅ | Đơn vị bán chính | `Bao`, `Chai`, `Gói`, `Cái`, `Kg` |
| `selling_price` | ✅ | Giá bán cho 1 đơn vị trên, **chỉ số, không dấu chấm** | `320000` |
| `cago_display_name` | nên có | Tên hiển thị cho khách (để trống = dùng `item_name`) | `Cám cò gà con 25kg` |
| `cago_local_names` | tùy | Tên địa phương / biệt danh (giúp tìm kiếm). Nhiều tên cách nhau bằng dấu phẩy | `cám cò, bao xanh con cò` |
| `cago_public_description` | tùy | Mô tả ngắn cho khách xem | `Thức ăn cho gà con.` |
| `cago_staff_advice` | tùy | Ghi chú **chỉ nhân viên thấy** (mẹo bán, lưu ý) | `Bán chạy nhất cho gà 1-21 ngày.` |
| `cago_use_cases` | tùy | Dùng để làm gì | `Bón lúa và rau màu` |
| `cago_crop_or_animal_targets` | tùy | Dùng cho cây/con nào | `Lúa, rau màu` |
| `cago_package_color` | tùy | Màu bao bì (giúp tìm "bao xanh") | `Xanh` |
| `cago_shelf_location` | tùy | Vị trí kệ để nhân viên lấy hàng | `Kệ cám A1` |
| `cago_stock_status_manual` | tùy | Trạng thái hiện thủ công | `Còn hàng` / `Hết hàng` / `Còn ít` |
| `cago_safety_notes` | tùy | Ghi chú an toàn **thêm** (cảnh báo chuẩn cho hoá chất đã tự động hiện, **không cần** chép vào) | |
| `cago_is_chemical` | ✅ | `1` = hoá chất (thuốc sâu/cỏ/chuột) → tự hiện cảnh báo an toàn; `0` = không | `1` |
| `cago_is_public_visible` | ✅ | `1` = hiện trên kiosk cho khách; `0` = chỉ nội bộ | `1` |
| `image` | tùy | Link 1 ảnh chính (URL hoặc /files/...) | |
| `cago_image_gallery` | tùy | Nhiều ảnh, mỗi link cách nhau bằng dấu phẩy hoặc xuống dòng | |

## Lưu ý quan trọng
- **Hoá chất** (thuốc trừ sâu/cỏ/chuột): đặt `cago_is_chemical = 1`. Hệ thống **tự** thêm cảnh báo an
  toàn chuẩn — **không** tự ghi liều lượng/cách pha vào mô tả.
- Giá viết **số trần**: `320000` (không phải `320.000` hay `320,000`).
- Chạy lại file đã sửa = **cập nhật** theo `item_code` (không tạo trùng) → có thể dùng để sửa giá hàng loạt.
- **Tồn kho đầu kỳ KHÔNG nằm trong file này.** Sau khi nhập sản phẩm, nhập số lượng tồn qua màn
  **"Nhập hàng"** (hoặc gửi tôi danh sách tồn, tôi nạp cho). Tương tự **công nợ đầu kỳ của khách** nhập
  riêng.

## Cách nạp file
Gửi lại file CSV đã điền cho tôi — tôi sẽ nạp + kiểm tra giúp. (Kỹ thuật: chạy trong frappe-bench:)

```bash
python scripts/import_products.py --site agrimate.localhost --csv /đường-dẫn/products.csv
```
