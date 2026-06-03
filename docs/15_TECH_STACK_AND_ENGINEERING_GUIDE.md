# 15 — Tech Stack and Engineering Guide

> ℹ️ **Current reality:** the front end has migrated to **Next.js (`web/`)** — ignore the "Phase 2 only" wording. See [27](27_FRONTEND_MIGRATION_NEXTJS.md) + [40](40_FRONTEND_DEV_GUIDE.md).

## 1. Official stack for MVP

### Core

```text
ERPNext v16
Frappe Framework
Python
MariaDB
Redis
Node/Yarn as required by Frappe
```

### Custom app

```text
Frappe app: cago
Language: Python + JavaScript
Templates/UI: Frappe Page / Jinja / HTML
API: Frappe whitelisted methods
Data: ERPNext DocTypes + Custom Fields + Custom DocTypes
```

### POS

```text
Preferred evaluation: POS Awesome V15
Mandatory fallback: ERPNext native POS
```

### MVP UI

```text
Frappe-native pages
Jinja/HTML
Vanilla JavaScript
Simple CSS
Tailwind optional only if integration is simple
```

Do not use in MVP unless explicitly requested:

```text
Next.js
React
Radix UI
shadcn/ui
TanStack Query
Zustand
PWA framework
```

### Phase 2 standalone kiosk

If the kiosk needs a standalone, product-grade UX:

```text
Next.js
React
TypeScript
Tailwind CSS
Radix UI or shadcn/ui
TanStack Query
Zustand
PWA/kiosk mode
```

### Auxiliary services

```text
Python only
FastAPI optional
Pydantic
requests/httpx
SQLite/Postgres if needed
```

No Go.

## 2. Engineering rules

- Do not modify ERPNext core.
- Do not modify Frappe core.
- Do not modify POS Awesome core unless documented and unavoidable.
- Business-specific logic belongs in `cago`.
- Public kiosk APIs must return DTOs, not raw DocTypes.
- Keep POS-specific code thin.
- Native POS fallback must remain usable.
- Start simple; do not over-engineer.

## 3. Required skills

### Must have

- Python
- Frappe Framework basics
- ERPNext DocType model
- Custom Fields / Fixtures
- Frappe whitelisted methods
- Basic JavaScript
- Basic HTML/CSS
- Role/Permission design
- MariaDB basics
- CSV import/export

### Should have

- ERPNext Item / Item Price / Stock / Customer / Sales Invoice
- ERPNext POS Profile
- Frappe bench
- Linux/Docker deployment
- Backup/restore
- API security

### Phase 2 skills

- TypeScript
- React / Next.js
- Tailwind CSS
- Radix UI or shadcn/ui
- PWA/kiosk deployment
- TanStack Query
- Zustand

### Chatbot phase skills

- Python FastAPI
- RAG/retrieval
- Vietnamese text normalization
- Prompt engineering
- LLM safety guardrails
- Vector DB optional

## 4. Practical defaults

- MVP UI should run inside Frappe/ERPNext.
- Use one repo first.
- Avoid microservices until there is a clear need.
- Keep product data in ERPNext.
- Keep advice/safety fields in `cago`.
- Use Python scripts for import/migration helpers.
