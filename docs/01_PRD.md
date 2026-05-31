# 01 — Product Requirements Document

## 1. Product name

**AgriMate** — Trợ lý bán hàng vật tư nông nghiệp.

## 2. Context

The store is a rural Vietnamese agricultural supplies shop. It sells animal feed, fertilizer, pesticides, rat poison, herbicides, seeds and farming supplies.

The owner has deep business knowledge but may be weak with technology. The system must reduce memory burden without forcing her to use complex ERP screens.

## 3. Core problem

Today:

- Product price and quality knowledge lives in the owner's head.
- Customers ask repeated questions.
- Substitute sellers must call the owner.
- Customers often identify products by image/color/nickname rather than official name.
- The shop may later hire staff, so permissions and accountability matter.
- Chemicals require safety-sensitive advice.

## 4. Product vision

```text
ERPNext = business system of record
cago = simple UI + agricultural selling knowledge layer
POS Awesome V15 = preferred POS UI if evaluation passes
Native POS = mandatory fallback
Python services = optional support layer
```

## 5. MVP goals

- Owner can tra giá and sửa giá easily.
- Staff can search and advise using product data.
- Customer can browse product images on tablet.
- POS sale can be completed reliably.
- Debt/customer flow is supported.
- Sensitive data is protected.
- Chemical safety warnings are always shown.

## 6. Non-goals for MVP

- AI diagnosis of plant disease from images.
- Online public e-commerce checkout.
- Payment gateway integration.
- Complex multi-branch ERP.
- Full accounting automation.
- Depending fully on POS Awesome without fallback.

## 7. User types

- Owner / mother
- Staff / substitute seller
- Customer / kiosk user
- Technical admin/developer

## 8. MVP feature list

| Feature | Priority |
|---|---|
| Product image/catalog | P0 |
| Product local names/nicknames | P0 |
| Owner simple tra giá | P0 |
| Owner simple sửa giá | P0 |
| Staff product advice screen | P0 |
| Customer kiosk | P0 |
| Native POS fallback | P0 |
| POS Awesome V15 evaluation | P0 |
| Chemical safety warnings | P0 |
| Role-based field hiding | P0 |
| Wanted list | P1 |
| Debt helper | P1 |
| Python chatbot/RAG | P2 |
| Zalo helper | P2 |
| Reports/dashboard | P2 |
