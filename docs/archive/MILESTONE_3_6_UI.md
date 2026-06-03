# Milestone 3–6 — UI & API layer (MVP)

> 🗄 **LƯU TRỮ.** Frontend nay là **Next.js (`web/`)** — xem [27](../27_FRONTEND_MIGRATION_NEXTJS.md). Doc này mô tả UI Frappe-native MVP cũ.

Implements the owner, staff and kiosk experiences plus the whitelisted API/DTO
layer they sit on. All store logic stays in `cago`; ERPNext core is
untouched. UI is Frappe-native (`www/` pages, Jinja, vanilla JS, simple CSS) — no
React/Next in MVP.

## Routes

| Route | Audience | Access | File |
|---|---|---|---|
| `/owner` | Chủ cửa hàng | Login + `Cago Owner` (or System Manager) | `www/owner/` |
| `/staff` | Nhân viên | Login + `Cago Staff`/`Cago Owner` | `www/staff/` |
| `/kiosk` | Khách (guest) | Public | `www/kiosk/` |

## Features

- **Owner:** Tra giá (tìm → xem giá/tồn/vị trí), Sửa giá (tìm → giá hiện tại → nhập
  giá mới → xác nhận → cập nhật Item Price + ghi Owner Action Log), nút mở POS gốc &
  ERPNext Desk.
- **Staff:** tra sản phẩm (tên/tên dân dã/màu/công dụng), chi tiết (ảnh, giá, tồn,
  vị trí, tư vấn, sản phẩm thay thế, khi nào gọi chủ, cảnh báo an toàn), tra cứu đơn
  khách chọn theo mã, nút mở POS gốc (POS Awesome ẩn vì chưa hỗ trợ v16).
- **Kiosk:** duyệt theo nhóm + tìm kiếm, thẻ sản phẩm ảnh lớn, chi tiết + cảnh báo
  hóa chất, chọn vào giỏ → gửi → nhận **mã đơn** (WL-YYYY-#####) để đọc cho người bán.

## API (whitelisted methods)

| Method | Guard | Returns |
|---|---|---|
| `api.owner.search_products` / `get_product` | owner | owner DTO |
| `api.owner.update_price(item_code, new_price)` | owner | old/new price text; writes action log |
| `api.staff.search_products` / `get_product` | staff | staff DTO (no buying price/margin) |
| `api.staff.get_wanted_list(code)` | staff | wanted list for fulfilment |
| `api.kiosk.get_categories` / `list_products` / `get_product` | guest | public DTO |
| `api.kiosk.create_wanted_list(items, note)` | guest | wanted list code |

DTOs are built in `utils/dto.py` with explicit field whitelists; safety warnings via
`utils/safety.py`; role guards in `utils/permissions.py`.

## Security model (verified)

Sensitive data is protected two ways, both enforced server-side:

1. **No raw DocType access** — `Cago Staff`/`Cago Kiosk` roles are not granted
   read permission on `Item`, so `GET /api/resource/Item/...` returns **403** for staff
   and guests.
2. **DTO whitelisting** — staff/kiosk responses contain only safe fields (no
   `valuation_rate`, `last_purchase_rate`, margin, buying price, customer/debt).

Verified end-to-end on a clean build (`10 passed, 0 failed`): guest kiosk works,
guest/staff blocked from staff API and raw Item, staff blocked from owner page,
owner price update logs an action, kiosk wanted-list round-trips to staff.

## Remaining operational setup (not code)

To complete a **native POS sale** (the mandatory fallback), an admin must, in ERPNext
Desk: create a **POS Profile**, set company currency to **VND** (setup wizard), and
grant the owner/cashier the standard ERPNext POS/sales roles. The UI already links to
`/app/point-of-sale`. POS Awesome stays deferred until a v16 build exists (docs/21).
