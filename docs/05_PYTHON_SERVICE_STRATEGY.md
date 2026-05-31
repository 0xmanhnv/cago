# 05 — Python Service Strategy

## 1. Decision

Use Python for all auxiliary services.

Do not use Go in this project.

## 2. Why Python

- Frappe/ERPNext already uses Python.
- Easier shared code/models.
- Easier for Claude Code to modify consistently.
- Easier chatbot/RAG ecosystem.
- Less operational complexity.

## 3. What stays inside Frappe app

Keep these in `cago`:

- custom fields
- DocTypes
- permissions
- owner/staff/kiosk APIs
- price update
- wanted list
- ERPNext data access
- safety rules

## 4. Optional external Python services

Use only if needed:

```text
services/
  cago_chatbot_service/
  cago_sync_service/
  cago_image_service/
  cago_zalo_service/
```

## 5. Chatbot service

Possible stack:

- FastAPI
- Python retrieval layer
- local SQLite/Postgres vector/keyword index if needed
- OpenAI/other LLM adapter later
- strict role-aware context filtering

## 6. Sync/cache service

Useful if shop internet is unstable.

Responsibilities:

- cache product DTOs for kiosk
- cache images
- sync periodically from ERPNext
- serve LAN kiosk if cloud ERPNext is slow

## 7. Image service

Responsibilities:

- compress product photos
- generate thumbnails
- maybe OCR label later, but owner approval required

## 8. Zalo helper

MVP should generate message drafts only.

Later integration can be evaluated.

Example draft:

```text
Chị Lan ơi, cám gà con loại chị hay lấy đã về hàng.
Giá hiện tại: 320.000đ/bao.
```

## 9. Service communication

Preferred:

- Frappe whitelisted APIs
- REST
- token-based auth for internal services
- no direct DB access from external services unless absolutely necessary

## 10. Keep it simple

Do not create external services until needed.

MVP can be entirely:

```text
ERPNext + cago Frappe app
```
