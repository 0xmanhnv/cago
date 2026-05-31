# 02 — Architecture

## 1. High-level architecture

```text
                         ┌──────────────────────┐
                         │ ERPNext / Frappe      │
                         │ Items, Price, Stock,  │
                         │ Sales, Customer, Debt │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │ cago            │
                         │ Custom Frappe App     │
                         │ UI + API + DocTypes   │
                         └─────┬───────────┬────┘
                               │           │
             ┌─────────────────▼───┐   ┌───▼────────────────┐
             │ Owner/Staff UI       │   │ Customer Kiosk      │
             │ Simple Vietnamese UI │   │ Tablet/catalog      │
             └─────────┬───────────┘   └────────────────────┘
                       │
          ┌────────────▼────────────┐
          │ POS Layer                │
          │ 1. POS Awesome V15       │
          │ 2. Native POS fallback   │
          └─────────────────────────┘

 Optional Python services:
  - chatbot/RAG
  - sync/cache
  - image processing
  - Zalo helper
```

## 2. Core design principles

- ERPNext remains source of truth.
- `cago` owns store-specific logic.
- POS Awesome V15 can be used if evaluation passes.
- Native POS must remain available.
- Python only for auxiliary services.
- No Go.
- Do not modify ERPNext core.
- Do not store core product knowledge in POS Awesome-specific code.

## 3. Component responsibilities

### ERPNext

Handles:

- Item
- Item Group
- Item Price
- Price List
- Stock
- Warehouse
- Customer
- Sales/POS Invoice
- Payment Entry
- Purchase
- Accounting
- Reports
- Permissions

### cago

Handles:

- agricultural product metadata
- owner simplified UI
- staff advice UI
- kiosk public catalog
- wanted list
- chemical safety rules
- API DTO filtering
- Python service integration
- reports/dashboard helpers

### POS Awesome V15

Possible role:

- main POS UI for staff if stable
- better touch/card/image flow
- faster POS operation

Must not be required for:

- product knowledge
- kiosk
- owner price update
- debt logic
- data model

### Native ERPNext POS

Role:

- mandatory fallback
- baseline sale flow
- safe default if POS Awesome fails

### Python services

Optional services for:

- chatbot/RAG
- background sync
- image optimization
- Zalo draft/integration
- local kiosk cache

## 4. Data flow

### Product setup

```text
Owner/Admin updates Item
→ agri custom fields stored in ERPNext
→ APIs return role-filtered DTOs
→ Owner/Staff/Kiosk views consume DTOs
```

### POS sale

```text
Staff searches in cago
→ opens POS Awesome or native POS
→ creates sale
→ ERPNext updates stock/accounting
```

### Kiosk wanted list

```text
Customer selects products
→ cago creates Agri Wanted List
→ Staff retrieves wanted list
→ Staff confirms and completes POS sale
```
