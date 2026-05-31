# 03 — ERPNext Capability Map

## 1. ERPNext provides

| Need | ERPNext feature |
|---|---|
| Product master | Item |
| Product category | Item Group |
| Unit | UOM |
| Product image | Item image |
| Selling price | Item Price / Price List |
| Buying price | Buying data / price list |
| Stock | Stock module |
| Warehouse | Warehouse |
| POS | Native POS + POS Profile |
| Sales invoice | Sales Invoice/POS Invoice |
| Customer | Customer |
| Debt | Accounts Receivable / unpaid invoices |
| Supplier | Supplier |
| Purchase | Purchase Order/Receipt/Invoice |
| Reports | Standard reports |
| Roles | Frappe role/permission system |

## 2. cago must add

| Need | Reason |
|---|---|
| Tên dân dã | Customers remember informal names |
| Package color | Customers identify by look |
| Advice script | Owner knowledge must be encoded |
| Product alternatives | Cheaper/equivalent/better |
| Plain shelf location | More practical than Warehouse only |
| Chemical safety rules | Store-specific safety |
| Owner simple UI | ERPNext Desk too complex |
| Staff search UI | Faster than raw ERPNext |
| Customer kiosk | Visual tablet UX |
| Chatbot/RAG | Not native |
| Wanted list | Customer-to-staff handoff |

## 3. POS capability

ERPNext native POS can be used for MVP/fallback.

POS Awesome V15 may provide better UX and should be evaluated, especially if item cards/images/touch UX are important.

## 4. Price model

Use ERPNext Item Price as source of truth.

Do not store official selling price only in custom fields.

## 5. Stock model

Use ERPNext stock for accurate inventory.

Use `cago_stock_status_manual` for human-friendly display:

- Còn nhiều
- Còn hàng
- Còn ít
- Hết hàng
- Sắp nhập
