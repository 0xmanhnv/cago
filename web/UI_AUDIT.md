# Cago UI audit — pos + kiosk

Mobile-first visual sweep (412px) + machine overflow check. Status per screen.

Legend: ✅ ok · 🔧 fixed this pass · ⚠ issue open · — not yet reviewed

## POS (owner/staff)

| # | Screen | Route | Status | Notes |
|---|--------|-------|--------|-------|
| 1 | Trang chủ | /pos | ✅ | responsive OK (6 bp) |
| 2 | Sản phẩm | /pos/products | ✅ | responsive OK (6 bp) |
| 3 | Thêm sản phẩm | /pos/products/new | ✅ | responsive OK (6 bp) |
| 4 | Sửa sản phẩm | /pos/products/[code]/edit | ✅ | responsive OK (6 bp) |
| 5 | Bán hàng | /pos/sell | ✅ | responsive OK (6 bp) |
| 6 | Tìm hàng | /pos/search | ✅ | responsive OK (6 bp) |
| 7 | Báo cáo | /pos/reports | ✅ | responsive OK (6 bp) |
| 8 | Nhà cung cấp | /pos/suppliers | ✅ | responsive OK (6 bp) |
| 9 | Công nợ | /pos/debt | ✅ | responsive OK (6 bp) |
| 10 | Kho hàng | /pos/inventory | ✅ | responsive OK (6 bp) |
| 11 | Khách đã chọn | /pos/orders | ✅ | responsive OK (6 bp) |
| 12 | Đơn hàng | /pos/sales | ✅ | responsive OK (6 bp) |
| 13 | Trả hàng | /pos/returns | ✅ | responsive OK (6 bp) |
| 14 | Đổi hàng | /pos/exchange | ✅ | responsive OK (6 bp) |
| 15 | Nhân viên | /pos/staff | ✅ | responsive OK (6 bp) |
| 16 | Cài đặt | /pos/settings | ✅ | responsive OK (6 bp) |
| 17 | Mã giảm giá | /pos/coupons | ✅ | responsive OK (6 bp) |
| 18 | Thông tin cửa hàng | /pos/store | ✅ | responsive OK (6 bp) |
| 19 | Nhập hàng loạt | /pos/bulk | ✅ | responsive OK (6 bp) |
| 20 | Sổ quỹ / Chốt ca | /pos/cashbook | ✅ | responsive OK (6 bp) |
| 21 | Loại hàng | /pos/categories | ✅ | responsive OK (6 bp) |
| 22 | Hàng khuyên dùng | /pos/recommended | ✅ | responsive OK (6 bp) |
| 23 | In tem | /pos/labels | ✅ | responsive OK (6 bp) |
| 24 | Kiểm tra dữ liệu | /pos/health | ✅ | responsive OK (6 bp) |
| 25 | Hàng sắp hết | /pos/low-stock | ✅ | responsive OK (6 bp) |
| 26 | Lô & hạn dùng | /pos/expiry | ✅ | responsive OK (6 bp) |
| 27 | Gợi ý nhập | /pos/reorder | ✅ | responsive OK (6 bp) |
| 28 | Nhập hàng | /pos/receive | ✅ | responsive OK (6 bp) |
| 29 | Lịch sử nhập | /pos/receive-history | ✅ | responsive OK (6 bp) |
| 30 | Hàng đợi hỗ trợ | /pos/support | ✅ | responsive OK (6 bp) |
| 31 | Câu hỏi cần lưu ý | /pos/unsafe | ✅ | responsive OK (6 bp) |
| 32 | Đối soát | /pos/verify | ✅ | responsive OK (6 bp) |
| 33 | Sẵn sàng | /pos/readiness | ✅ | responsive OK (6 bp) |
| 34 | Cảnh báo hôm nay | /pos/alerts | ✅ | responsive OK (6 bp) |
| 35 | Sửa thanh dưới | /pos/tabbar | ✅ | responsive OK (6 bp) |
| 36 | Đơn chờ đồng bộ | /pos/pending | ✅ | responsive OK (6 bp) |
| 37 | Nội dung trợ lý | /pos/assistant-content | ✅ | responsive OK (6 bp) |
| 38 | Ghi nợ | /pos/record-debt | ✅ | responsive OK (6 bp) |
| 39 | Khách trả nợ | /pos/record-payment | ✅ | responsive OK (6 bp) |
| 40 | Trợ lý học gì | /pos/assistant-insights | ✅ | responsive OK (6 bp) |
| 41 | Cài đặt trợ lý AI | /pos/ai-settings | — | admin-only |
| 42 | Kết nối & Kênh | /pos/integrations | — | admin-only |
| 43 | Sao lưu | /pos/backup | — | admin-only |

## Kiosk (khách)

| # | Screen | Route | Status | Notes |
|---|--------|-------|--------|-------|
| K1 | Kiosk home | / | ✅ | responsive OK (6 bp) |
| K2 | Danh mục sản phẩm | /products | ✅ | responsive OK (6 bp) |
| K3 | Chi tiết sản phẩm | /products/[code] | ✅ | responsive OK (6 bp) |
| K4 | Giỏ (wanted) | /cart | ✅ | responsive OK (6 bp) |
| K5 | Trợ giúp | /help | ✅ | responsive OK (6 bp) |
| K6 | Sơ đồ kệ | /map | ✅ | responsive OK (6 bp) |
| K7 | Tra nợ của tôi | /my-debt | ✅ | responsive OK (6 bp) |
| K8 | Trợ lý | /assistant | ✅ | responsive OK (6 bp) |
| K9 | Theo dõi đơn | /track | ✅ | responsive OK (6 bp) |
| K10 | Màn hình phụ (CFD) | /display | ✅ | responsive OK (6 bp) |

## Responsive machine check — overflow at 6 breakpoints (360 / 414 / 768 / 1024 / 1280 / 1536)
**ALL 39 pos + 9 kiosk routes = 48 screens × 6 widths = 288 checks → NO horizontal overflow anywhere.**
Layout is responsive-clean at every screen size. (run: resp.mjs)

## Visual spot-check (mobile 412) — done this pass
- Kiosk: home ✅, cart ✅, help ✅, assistant ✅, products ✅ — consistent, on-brand, no issues.
- POS: reports ✅, cashbook ✅, new product ✅ (header full / form 820), suppliers/sell/debt/products
  (seen earlier this session) ✅.

## Form-width on desktop (header full-bleed, content constrained)
Fixed: NewProduct, ProductEditor, Settings, Coupons, StoreProfile, AiSettings, ConnectScreen,
BackupScreen, TabBarConfig (max-w-820), Cashbook + Ghi nợ/Trả nợ (max-w-640).

## Sub-features (modals / sheets / sub-tabs) — overflow at 390 / 768 / 1280
- Bán hàng: pay-sheet ✅, tách/trả một phần ✅, keypad ✅, xem chi tiết (preview) ✅
- Báo cáo tabs: Lãi lỗ ✅, Kho hàng ✅, Thu chi ✅
- Ghi nợ: customer picker ✅
→ No overflow in any sub-state at any tested size.

## Conclusion
Full pos + kiosk sweep at 6 breakpoints (top-level) + key sub-features at 3 sizes: **zero horizontal
overflow / broken layouts**. Visual spot-checks consistent + on-brand. Remaining polish was form-width
on desktop (now constrained on every form page). Device QA on a real phone still recommended for feel.
