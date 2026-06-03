# 08 — Owner and Staff UI Spec

> 🗄 **Old MVP spec.** Current UI: [27](../27_FRONTEND_MIGRATION_NEXTJS.md) (Next.js) + [36](../36_STAFF_MOBILE_POS_PLAN.md) (POS). The owner home is now grouped into 6 sections.

## 1. Owner UI

Do not expose raw ERPNext to the owner for daily use.

Home:

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

## 2. Owner: Tra giá

- search by name/nickname/color
- show image, price, stock, location

## 3. Owner: Sửa giá

Flow:

```text
Search product
→ show current price
→ input new price
→ confirm
→ update Item Price
→ log action
```

## 4. Owner: Ghi nợ / trả nợ

Prefer ERPNext accounting objects behind the scenes, but simple UI in front.

## 5. Staff UI

Home:

```text
NHÂN VIÊN BÁN HÀNG

[ Tra sản phẩm ]
[ Mở POS Awesome ]
[ Mở POS gốc ]
[ Danh sách khách chọn ]
```

If POS Awesome is not installed/pass:

- hide or disable POS Awesome button
- use native POS button

## 6. Staff product detail

Show:

- image
- selling price
- stock status
- shelf location
- advice
- alternatives
- safety notes
- call-owner condition

Hide:

- import price
- profit
- supplier cost
