# cago_chatbot_service

Optional Python (FastAPI) chatbot for AgriMate. Answers customer product questions
**strictly from the store's public data** via the guest-safe kiosk API.

## Guardrails (docs/10, docs/12)

- Never invents price, stock, use, dosage or mixing advice.
- Refuses dosage / mixing questions ("pha bao nhiêu", "liều", "trộn") and points to the
  label / seller.
- Always appends the standard safety warning when a chemical product is involved.
- Uses only the public kiosk endpoint — no buying price, margin, customer or debt data.
- Answers deterministically by default (offline, safe). An LLM is optional and, if
  enabled, must still be constrained to the retrieved context + system prompt.

## Run locally

```bash
pip install -r requirements.txt
ERPNEXT_URL=http://localhost:8080 uvicorn app.main:app --port 8100
curl -s localhost:8100/chat -H 'content-type: application/json' \
  -d '{"message":"cám gà con giá bao nhiêu"}'
```

## Run in the stack

```bash
cd infra/docker
docker compose --profile chatbot up -d --build chatbot
curl -s localhost:8100/chat -H 'content-type: application/json' -d '{"message":"thuốc chuột"}'
```

## Test

```bash
cd services/cago_chatbot_service && pytest -q
```
