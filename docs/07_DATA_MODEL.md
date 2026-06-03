# 07 — Data Model

> ℹ️ **Thực tế hiện tại:** DTO/trường đã mở rộng (ca, loyalty, đa đơn vị, khuyên dùng, offline…). Nguồn đúng: `cago/utils/dto.py` + [39](39_API_REFERENCE.md).

## 1. Source of truth

ERPNext remains source of truth for:

- Item
- Item Price
- Stock
- Customer
- Sales/POS Invoice
- Payment Entry
- Purchase

## 2. Public product DTO

For kiosk/customer:

```json
{
  "item_code": "CAM-GA-CON-25KG",
  "display_name": "Cám cò gà con 25kg",
  "category": "Cám chăn nuôi",
  "image": "/files/cam-ga-con.jpg",
  "price_text": "320.000đ / bao",
  "unit": "Bao",
  "public_description": "Cám cho gà con giai đoạn đầu.",
  "use_cases": "Gà con",
  "package_color": "Xanh trắng",
  "stock_status": "Còn hàng",
  "is_chemical": false,
  "safety_notes": ""
}
```

## 3. Staff product DTO

```json
{
  "item_code": "NPK-16-16-8-A",
  "display_name": "NPK 16-16-8 loại A",
  "official_name": "Phân NPK 16-16-8 thương hiệu A",
  "category": "Phân bón",
  "image": "/files/npk-a.jpg",
  "selling_price": 420000,
  "unit": "Bao",
  "stock_status": "Còn ít",
  "actual_stock_qty": 12,
  "shelf_location": "Kho sau - dãy NPK",
  "public_description": "Phân NPK dùng cho giai đoạn cây phát triển thân lá.",
  "staff_advice": "Nếu khách đang bón thúc thì tư vấn loại này.",
  "use_cases": "Bón thúc, phát triển thân lá",
  "call_owner_when": "Khách hỏi trộn với thuốc/phân khác.",
  "alternatives": {
    "cheaper": [],
    "equivalent": [],
    "better": []
  },
  "is_chemical": false,
  "safety_notes": ""
}
```

## 4. Never expose publicly

- buying price
- valuation rate
- profit/margin
- supplier cost
- customer debt
- internal owner notes
- API keys

## 5. Search fields

Search should cover:

- item_code
- item_name
- cago_display_name
- cago_local_names
- item_group
- cago_use_cases
- cago_crop_or_animal_targets
- cago_package_color

## 6. Price

Use ERPNext Item Price.

## 7. Stock

Use ERPNext accurate stock + manual display status.

## 8. Wanted list

Used for customer kiosk to staff handoff.
