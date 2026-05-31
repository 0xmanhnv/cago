# CLAUDE.md — Instructions for Claude Code

You are Claude Code working on an ERPNext v16/Frappe customization project for a rural Vietnamese agricultural supplies store.

## Architecture decision

Use:

```text
ERPNext/Frappe
  + custom Frappe app: cago
  + ERPNext native POS fallback
  + POS Awesome V15 if evaluation passes
  + Python-only auxiliary services
```

Do not use Go. If an external service is needed, use Python.


## Tech stack rules

> **Frontend decision update (2026-05-31, owner-approved):** The UI has migrated to a
> **decoupled Next.js 16 app** (App Router, TypeScript, Tailwind + shadcn/Radix,
> TanStack Query, Zustand, PWA) under `web/`. It is the public entry and proxies Frappe
> over one origin (cookie session + CSRF). The Frappe backend stays **API-first**
> (`cago.api.*` whitelisted methods with role-scoped DTOs) — that is the contract the
> Next.js app consumes. The Frappe-native `www/` pages remain as an internal fallback.
> The rules below are the original MVP constraint and are superseded for the frontend by
> this decision; auxiliary services remain Python (no Go). See docs/27.

MVP UI must use:

```text
Frappe-native pages
Jinja/HTML
Vanilla JavaScript
Simple CSS
Tailwind only if integration is simple and does not complicate Frappe deployment
```

Do not introduce in MVP unless explicitly requested:

```text
Next.js
React
Radix UI
shadcn/ui
TanStack Query
Zustand
PWA frontend app
```

Phase 2 standalone kiosk may use:

```text
Next.js + React + TypeScript + Tailwind CSS + Radix UI or shadcn/ui + TanStack Query + Zustand + PWA/kiosk mode
```

All auxiliary services must use Python. Do not use Go.

## POS decision

POS Awesome V15 is allowed and should be evaluated seriously because it may provide a better POS user experience than ERPNext native POS.

However:

- Do not make the whole system depend on POS Awesome.
- Native ERPNext POS must remain a working fallback.
- Do not store core product knowledge only inside POS Awesome-specific code.
- `cago` is the core business customization layer.

## Business context

The store sells:

- animal feed: cám cò, cám gà, cám vịt, cám lợn
- fertilizers: phân lân, đạm, NPK, kali, hữu cơ
- pesticides/crop protection
- rat poison
- herbicides
- seeds
- small farming tools

The owner may be weak with technology. Do not expect her to use raw ERPNext screens every day.

## Product goal

Build a practical system that supports:

1. Owner simple UI: tra giá, sửa giá, ghi nợ, khách trả nợ, báo cáo hôm nay.
2. Staff UI: search product, image, price, shelf location, advice, alternatives.
3. Customer kiosk: browse product images/categories on tablet.
4. ERPNext backend: product, price, stock, customer, debt, sale, purchase.
5. POS: POS Awesome V15 if stable; native POS fallback.
6. Python services: chatbot/RAG, sync/cache, image processing, Zalo message helper if needed.

## User roles

### Owner

Can:

- manage products
- update selling price
- see import price/profit
- manage customer debt
- see reports
- configure advice/safety notes

### Staff

Can:

- sell via POS
- search products
- see price/image/location/advice
- see customer/wanted-list info if allowed

Cannot usually see:

- import price
- profit/margin
- supplier cost
- admin settings

### Customer/Kiosk

Can:

- browse categories
- see images
- see public price/description
- create wanted list

Cannot:

- create final invoice
- see internal fields
- see customer/debt data

## Safety rules

For pesticides, herbicides, rat poison, crop-protection chemicals:

- never invent dosage
- never invent mixing advice
- never encourage stronger-than-label usage
- always show safety warning
- escalate unclear questions to owner/qualified person

Standard warning:

```text
Lưu ý: Đọc kỹ hướng dẫn trên nhãn sản phẩm trước khi sử dụng. Để xa trẻ em, vật nuôi, thức ăn và nguồn nước. Không tự ý tăng liều hoặc trộn với sản phẩm khác nếu chưa có hướng dẫn rõ ràng.
```

## First task

Before coding:

1. Read all docs.
2. Summarize architecture.
3. Propose repo structure.
4. Propose Frappe app structure for `cago`.
5. Propose Python service structure if needed.
6. Propose POS evaluation plan for POS Awesome V15.
7. Propose Milestone 1 implementation plan.
8. Do not code until the plan is written.

## Definition of Done for MVP

MVP is done when:

- Owner can tra giá and sửa giá in simplified UI.
- Staff can search product by official name, nickname, color, use case.
- Staff sees selling price, image, stock status, location, advice, alternatives.
- Customer can browse product catalog on tablet/kiosk.
- Final sale can be done via native POS or POS Awesome if evaluation passes.
- Native POS fallback remains available.
- Sensitive fields are hidden from staff/customer.
- Chemical products show safety warning.
- Sample CSV import/update workflow exists.
