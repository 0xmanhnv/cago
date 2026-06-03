# 16 — UI/UX Design System

> ℹ️ **Partly dated.** The owner home is now grouped into 6 sections and the POS is Cago-native
> `/pos/sell` (not POS Awesome). The principles below still hold. Vietnamese strings in this doc are
> intentional UI labels/terms (and the mandatory safety warning) — they stay in Vietnamese by design.

## 1. Design target

Primary users:

- rural shop owner, weak with technology
- substitute seller/staff
- older rural customers on tablet

Therefore UI must be:

- Vietnamese first
- big buttons
- big images
- minimal typing
- minimal menus
- clear confirmation
- forgiving
- not ERP-like

## 2. Language rules

Avoid ERP terms:

| Avoid | Use |
|---|---|
| Sales Invoice | Hóa đơn bán hàng |
| Item | Sản phẩm |
| Warehouse | Kho / Vị trí hàng |
| Receivable | Công nợ |
| Payment Entry | Thu tiền |
| Stock Ledger | Lịch sử tồn kho |
| POS Profile | Cấu hình bán hàng |

## 3. Layout rules

- Max 6-8 main actions on home screen.
- Buttons at least 48px height.
- Product cards must prioritize image first.
- Use short labels.
- Always show Back/Home.
- Avoid dense tables on mobile/tablet.
- Confirmation before price/debt changes.

## 4. Owner home

```text
CHỦ CỬA HÀNG

[ Tra giá ]
[ Bán hàng ]
[ Sửa giá ]
[ Ghi nợ ]
[ Khách trả nợ ]
[ Hàng sắp hết ]
[ Báo cáo hôm nay ]
```

## 5. Staff home

```text
NHÂN VIÊN BÁN HÀNG

[ Bán hàng ]        (Cago-native /pos/sell)
[ Tra sản phẩm ]
[ Trả / Đổi hàng ]
[ Khách đã chọn ]
[ Hỏi trợ lý ]
```

## 6. Kiosk home

```text
BÁC CẦN MUA GÌ?

[ Cám chăn nuôi ]
[ Phân bón ]
[ Thuốc sâu / thuốc bệnh ]
[ Thuốc cỏ ]
[ Thuốc chuột ]
[ Hạt giống ]
[ Hỏi trợ lý ]
[ Gọi người bán ]
```

## 7. Product card

Must show:

- image
- display name
- price
- unit
- stock status
- short use case

## 8. Chemical product warning

Show prominent warning block.

```text
Lưu ý: Đọc kỹ hướng dẫn trên nhãn sản phẩm trước khi sử dụng. Để xa trẻ em, vật nuôi, thức ăn và nguồn nước.
```

## 9. MVP styling

Use simple CSS.

Tailwind is allowed only if it does not complicate Frappe deployment.

## 10. Phase 2 design system

If standalone kiosk is built:

- Next.js
- TypeScript
- Tailwind
- Radix/shadcn
- kiosk mode
- PWA
- large cards
- offline cache if needed
