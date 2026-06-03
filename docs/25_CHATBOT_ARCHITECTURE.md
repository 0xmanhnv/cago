# 25 — Chatbot Architecture & Implementation Plan (DESIGN — not yet built)

> ℹ️ **Đã triển khai.** Kiến trúc này đã được build (`cago/chatbot/*`). Giữ làm tài liệu thiết kế.

> Status: **DESIGN ONLY. Do not code until approved.**
> Naming: the repo app is **`cago`** (module `Cago`, APIs under `cago.api.*`). The
> brief's `cago_store` maps to `cago`. The visible brand stays "Cago".
> Builds on existing: `cago.utils.dto` (role-filtered DTOs), `cago.api.{kiosk,staff,owner}`,
> and the current `services/cago_chatbot_service` (deterministic prototype) which this
> design supersedes/absorbs.

---

## 0. Key architectural decision (needs your sign-off)

**Where does the chatbot backend run?**

- **Option A (RECOMMENDED): inside the `cago` Frappe app** as a `cago/chatbot/` package
  exposed via whitelisted endpoints `cago.api.chatbot.*`.
  - ✅ Native session → role (`frappe.session.user`, `ensure_staff/ensure_owner`) — the
    single most important property for "never expose sensitive data".
  - ✅ Retrieval calls the in-process role-filtered DTO functions directly (no extra HTTP
    hop, no second auth surface). Satisfies "all data access via `cago` service functions".
  - ✅ LLM adapters are pure-Python (httpx), import-free of Frappe → independently testable.
  - ⚠️ Outbound LLM calls run in a web worker → must enforce hard timeouts; heavy
    concurrency later can move to background/gateway.
- **Option B: standalone FastAPI service** (today's `cago_chatbot_service`).
  - ✅ Isolation/scaling, easy SSE streaming.
  - ❌ Must re-implement auth + role propagation; tends to hit only the public kiosk API →
    weak for staff/owner sensitive data. Higher risk for requirement #6.

**Recommendation:** Option A as the canonical backend. Keep an **optional thin FastAPI
gateway** (the existing service, repurposed) only as an edge for streaming/rate-limiting
that *proxies to the whitelisted endpoints carrying the user session* — it never imports
`cago` and never sees the DB. The LLM-provider and safety logic live in one shared
`cago/chatbot/` package so there is exactly one source of truth.

The rest of this document assumes Option A.

---

## 1. Architecture diagram (text)

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Frappe-native UI (vanilla JS)                                           │
│   /kiosk  → ask_kiosk()      /staff → ask_staff()    /owner → ask_owner()│
└───────────────┬─────────────────────────┬───────────────────────────────┘
                │ frappe.call (POST, session cookie carries role)
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Chatbot API layer   cago/api/chatbot.py  (whitelisted)                  │
│   ask_kiosk(allow_guest) | ask_staff(ensure_staff) | ask_owner(ensure_owner) │
│   → resolves ROLE from session, calls orchestrator.ask(role, messages)  │
└───────────────┬───────────────────────────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Orchestrator   cago/chatbot/orchestrator.py                             │
│  1) Safety.preclassify(question)         ── chemical-sensitive intent?  │
│  2) Retrieval.search(role, question)     ── role-filtered DTOs (dto.py) │
│  3) if no data → return "không tìm thấy trong dữ liệu cửa hàng"         │
│  4) Context.build(role, products)        ── compact, role-safe text     │
│  5) Prompts.build(role, context, history)── system+context+user         │
│  6) if unsafe intent & not label-verified → Safety.refuse() (skip LLM)  │
│  7) Provider = providers.get(config)     ── provider-agnostic           │
│  8) result = provider.chat(messages)     ── LLM sees ONLY context text  │
│  9) Safety.postprocess(result, products) ── inject warnings, scrub      │
│ 10) ResponseFormatter → JSON schema                                     │
│ 11) Observability.log(...)                                              │
└───────┬───────────────────────────────────────────────┬───────────────┘
        │ (data access — never the LLM)                  │ (LLM only — no DB)
        ▼                                                 ▼
┌──────────────────────────┐                  ┌─────────────────────────────┐
│ Retrieval/Context        │                  │ LLM Provider abstraction    │
│ cago.utils.dto.*         │                  │ providers/base.py (ABC)     │
│ (public/staff/owner DTO) │                  │  ├ openai_compat (OpenAI,   │
│ → ERPNext Item/Item Price│                  │  │   Ollama, vLLM, LM Studio)│
│   (role-filtered only)   │                  │  ├ anthropic                │
└──────────────────────────┘                  │  ├ gemini                   │
                                               │  └ FakeProvider (tests)     │
                                               │  + fallback provider        │
                                               └─────────────────────────────┘
```

Invariants: **LLM never touches the DB**; it only receives the context string the
context builder produced. **Role is decided server-side from the session**, never from a
client parameter.

---

## 2. Folder structure

```text
frappe-apps/cago/cago/
  api/
    chatbot.py                 # whitelisted: ask_kiosk / ask_staff / ask_owner
  chatbot/
    __init__.py
    config.py                  # provider selection, keys, fallback (site_config + env)
    orchestrator.py            # the pipeline (ask)
    retrieval.py               # role-aware search + detail via dto.py
    context.py                 # compact role-safe context builder
    safety.py                  # chemical intent detection, refusal, warning text
    prompts.py                 # VI system prompt + templates
    schema.py                  # request/response dataclasses + json schema
    observability.py           # structured logging → Cago Chatbot Log
    providers/
      __init__.py              # registry + get_provider(config) factory
      base.py                  # LLMProvider ABC, Message, LLMResult
      openai_compat.py         # OpenAI / Ollama / vLLM / LM Studio (base_url switch)
      anthropic.py
      gemini.py
      fake.py                  # deterministic provider for tests / offline
  cago/doctype/
    cago_chatbot_log/          # observability records (optional but recommended)
  tests/
    test_chatbot_providers.py
    test_chatbot_retrieval.py
    test_chatbot_roles.py
    test_chatbot_safety.py
    test_chatbot_nodata.py
    test_chatbot_provider_switch.py

services/cago_chatbot_service/  # OPTIONAL edge gateway (proxy + SSE), retire if unused
```

Rule: **no product knowledge in `providers/`**; no LLM calls in UI; no DB calls in
providers.

---

## 3. API endpoint design (whitelisted, role-scoped)

```python
# cago/api/chatbot.py
@frappe.whitelist(allow_guest=True)
def ask_kiosk(message: str, history: str | None = None) -> dict   # role = "customer"

@frappe.whitelist()
def ask_staff(message: str, history: str | None = None) -> dict    # ensure_staff(); role="staff"

@frappe.whitelist()
def ask_owner(message: str, history: str | None = None) -> dict    # ensure_owner(); role="owner"
```

- `message`: current user turn (string, length-capped, e.g. ≤ 1000 chars).
- `history`: optional JSON list `[{ "role": "user"|"assistant", "content": "..." }]`,
  capped (e.g. last 6 turns) — system prompt is always rebuilt server-side, never taken
  from the client.
- Role is **derived from the endpoint + session**, never from a request field.
- Returns the Response JSON (section 9).
- Guest abuse control on `ask_kiosk`: per-IP/session rate limit + message length cap
  (reuse the wanted-list cap philosophy).
- **Streaming**: MVP is non-streaming (one JSON response). Streaming (SSE) is Phase 2 via
  the optional FastAPI gateway; `stream_chat` exists in the interface for that path.

---

## 4. LLM provider interface

```python
# cago/chatbot/providers/base.py
@dataclass
class Message:
    role: str       # "system" | "user" | "assistant"
    content: str

@dataclass
class LLMResult:
    text: str
    model: str
    provider: str
    usage: dict | None = None       # tokens if available
    finish_reason: str | None = None

class LLMProvider(ABC):
    name: str
    @abstractmethod
    def chat(self, messages: list[Message], *, model: str, temperature: float = 0.2,
             max_tokens: int = 800, tools: list | None = None, timeout: int = 30) -> LLMResult: ...
    def stream_chat(self, messages, *, model, temperature=0.2, max_tokens=800,
                    tools=None, timeout=60) -> Iterator[str]:
        raise NotImplementedError  # optional per provider
    def supports_streaming(self) -> bool: return False
```

- Common `Message` list in, normalized `LLMResult` out → business logic is provider-blind.
- `tools` is accepted for future function-calling but **unused in MVP** (retrieval happens
  before the LLM, so the model needs no DB tools).
- Errors normalized to `LLMError` (timeout, auth, rate-limit, server) so the orchestrator
  can trigger fallback uniformly.

---

## 5. Provider adapter design

| Adapter | Targets | Notes |
|---|---|---|
| `openai_compat` | OpenAI, **Ollama / vLLM / LM Studio** | one adapter, `base_url` switches target; `/v1/chat/completions` |
| `anthropic` | Claude (Messages API) | splits system vs messages; maps to `messages` + `system` |
| `gemini` | Google Gemini | `generateContent`; maps roles (`user`/`model`) |
| `fake` | tests / offline | returns a deterministic echo/refusal — no network |

- All adapters: `httpx` with timeout, retbuilt request from `Message[]`, map response →
  `LLMResult`, raise normalized `LLMError`. **No product logic, no secrets in code.**
- `providers/__init__.py`: `get_provider(name) -> LLMProvider` factory + registry; the
  orchestrator asks for `config.primary` then `config.fallback`.

---

## 6. Retrieval / context-building design

**Retrieval (`retrieval.py`)** — role-aware, reuses `cago.utils.dto`:

| Role | List search | Detail |
|---|---|---|
| customer | `dto.list_dtos(q, "public", public_only=True)` | `dto.public_dto` |
| staff | `dto.list_dtos(q, "staff")` | `dto.staff_dto` |
| owner | `dto.list_dtos(q, "owner")` | `dto.owner_dto` |

- Search already spans item_code, item_name, local names, package color, category, use
  case, crop/animal target (`dto.SEARCH_FIELDS`).
- NL fallback (multi-word tokenize + ≥2-keyword precision) — port from the current service
  into `retrieval.py`.
- Top-K cap (e.g. K=5) to bound context size and cost.

**Context (`context.py`)** — compact, role-safe:

- For each retrieved product, emit a small block:
  - **All roles:** display_name, price_text, stock_status, unit, public_description,
    use_cases, package_color, image (URL only), safety_notes (chemical → standard warning).
  - **staff/owner only:** staff_advice, shelf_location, alternatives, call_owner_when.
  - **never (any role via chatbot):** import/buying price, valuation, profit/margin,
    supplier cost, customer/debt, internal private notes. (DTOs already exclude these; the
    context builder asserts the key whitelist as defense-in-depth.)
- If retrieval is empty → context = `NO_DATA` sentinel; orchestrator returns the
  "not found in store data" answer **without calling the LLM**.

---

## 7. Safety policy

**Pre-classification (before LLM)** — `safety.classify(question)` flags chemical-sensitive
intents:

- dosage / liều lượng ("bao nhiêu ml/g/nắp", "liều")
- mixing chemicals / pha–trộn ("trộn", "pha với")
- stronger-than-label ("tăng liều", "đậm hơn", "mạnh hơn nhãn")
- near-harvest / PHI ("gần thu hoạch", "trước thu hoạch mấy ngày")
- misuse of rat poison / pesticide ("ăn được không", dùng sai mục đích)
- medical/veterinary dosing

**Decision table:**

| Situation | Action |
|---|---|
| Sensitive intent, and answer NOT explicitly in verified product data | **Refuse** with safe response + label warning + `needs_staff_help=true` (skip LLM) |
| Sensitive intent, answer IS in verified `safety_notes`/product data | Answer **only** quoting the verified text + label warning |
| Any chemical product in context | Always append `STANDARD_SAFETY_WARNING` (deterministic, not LLM-generated) |
| Non-chemical | Normal answer |

- The warning is injected by code, **never relied upon from the LLM**.
- **Post-processing** guard: if the model output appears to contain invented dosage
  numbers/units not present in the context, downgrade to the refusal template (best-effort
  heuristic) and set `needs_staff_help=true`.

Standard warning (verbatim, already in `cago.utils.safety.STANDARD_SAFETY_WARNING`):
> Lưu ý: Đọc kỹ hướng dẫn trên nhãn sản phẩm trước khi sử dụng. Để xa trẻ em, vật nuôi,
> thức ăn và nguồn nước. Không tự ý tăng liều hoặc trộn với sản phẩm khác nếu chưa có
> hướng dẫn rõ ràng.

---

## 8. Prompt templates

```text
[SYSTEM] (VI)
Bạn là trợ lý bán hàng của một cửa hàng vật tư nông nghiệp ở Việt Nam.
Chỉ trả lời dựa trên DỮ LIỆU SẢN PHẨM trong phần NGỮ CẢNH bên dưới.
Tuyệt đối KHÔNG bịa: giá, tồn kho, sự tồn tại của sản phẩm, liều lượng,
cách pha/trộn thuốc, tuyên bố an toàn hóa chất, thời gian cách ly thu hoạch,
tư vấn y tế/thú y.
Nếu thiếu dữ liệu: nói rõ "không tìm thấy trong dữ liệu cửa hàng" và mời hỏi
người bán/chủ cửa hàng.
Với thuốc sâu, thuốc cỏ, thuốc chuột, hóa chất bảo vệ thực vật:
- Luôn nhắc đọc kỹ nhãn sản phẩm.
- Luôn nhắc để xa trẻ em, vật nuôi, thức ăn, nguồn nước.
- Không gợi ý dùng quá liều ghi trên nhãn.
- Không hướng dẫn pha/trộn trừ khi dữ liệu sản phẩm đã xác minh có sẵn.
- Nếu chưa rõ, mời hỏi chủ cửa hàng hoặc người có chuyên môn.
Trả lời ngắn gọn, dễ hiểu, phù hợp khách nông thôn. {role_note}

[CONTEXT]
{compact_role_safe_product_blocks  OR  "NO_DATA"}

[HISTORY]  (optional, capped)
{prior_turns}

[USER]
{message}
```

- `role_note`: customer = "Đối tượng là khách hàng."; staff/owner = "Đối tượng là nhân
  viên/chủ — có thể nêu tư vấn bán hàng, vị trí kệ, sản phẩm thay thế."
- The context block is the **only** product knowledge the model receives.

---

## 9. Response JSON schema

```jsonc
{
  "answer_text": "string (VI, safe)",
  "product_cards": [
    {
      "item_code": "NPK-16-16-8-A",
      "display_name": "NPK 16-16-8 loại A",
      "image": "/files/npk-a.jpg",
      "price_text": "420.000đ / Bao",
      "stock_status": "Còn ít",
      "short_description": "Phân NPK bón thúc, phát triển thân lá."
    }
  ],
  "safety_warnings": ["Lưu ý: Đọc kỹ hướng dẫn trên nhãn ..."],
  "needs_staff_help": false,
  "sources": ["NPK-16-16-8-A", "PHAN-LAN-VD-25KG"],   // item_codes used as context
  "confidence": "high | medium | low"
}
```

- `product_cards` are built from the **retrieved DTOs**, not from LLM text (so prices/stock
  are always real).
- `sources` = item_codes that fed the context (traceability).
- `confidence`: `low` when no data / refusal, `high` when answer maps to ≥1 source.
- `needs_staff_help=true` for refusals, unsafe intents, or "ask the owner" cases → UI shows
  a "Gọi người bán" affordance.

---

## 10. Configuration design

Precedence: **env var > Frappe Site Config > default**. Keys:

| Key (env) | Site Config key | Purpose |
|---|---|---|
| `CAGO_LLM_PROVIDER` | `cago_llm_provider` | `openai` \| `anthropic` \| `gemini` \| `ollama`(openai_compat) |
| `CAGO_LLM_MODEL` | `cago_llm_model` | model id |
| `CAGO_LLM_BASE_URL` | `cago_llm_base_url` | for openai_compat / local servers |
| `CAGO_LLM_API_KEY` | `cago_llm_api_key` | **secret — never logged** |
| `CAGO_LLM_FALLBACK_PROVIDER` | `cago_llm_fallback_provider` | used on primary failure/timeout |
| `CAGO_LLM_FALLBACK_MODEL` / `_BASE_URL` / `_API_KEY` | … | fallback config |
| `CAGO_LLM_TIMEOUT` | `cago_llm_timeout` | seconds (default 30) |
| `CAGO_LLM_MAX_TOKENS` / `_TEMPERATURE` | … | generation params |
| `CAGO_CHATBOT_ENABLED` | `cago_chatbot_enabled` | kill-switch; if off, deterministic-only mode |

- **Deterministic fallback**: if no provider configured or all fail, the orchestrator falls
  back to the current rule-based answer (retrieval + template) so the kiosk never breaks.
- Switching provider = change config only; zero business-logic change.

---

## 11. Test plan

| Test file | Covers |
|---|---|
| `test_chatbot_providers.py` | each adapter maps Message[]→request and response→LLMResult (httpx mocked); `LLMError` normalization; `FakeProvider` |
| `test_chatbot_provider_switch.py` | `get_provider(config)` returns right adapter; fallback triggers on primary error |
| `test_chatbot_retrieval.py` | search by code/name/local-name/color/category/use-case/crop; NL tokenize fallback; top-K cap |
| `test_chatbot_roles.py` | customer context has NO staff_advice/shelf/alternatives/sensitive; staff has them; owner ditto; endpoint role enforcement (guest→ask_staff = 403) |
| `test_chatbot_safety.py` | dosage/mixing/stronger/near-harvest/rat-poison → refusal + warning + needs_staff_help; chemical product → warning always present |
| `test_chatbot_nodata.py` | unknown product → "không tìm thấy trong dữ liệu cửa hàng", no LLM call, confidence=low |

- Providers/safety → pure `pytest` (no Frappe). Retrieval/roles/endpoints → `FrappeTestCase`.
- Orchestrator tests use `FakeProvider` for determinism (no network, no cost).

---

## 12. Milestone implementation plan

- **M-C1 — Provider abstraction (no Frappe):** `base.py`, `openai_compat`, `anthropic`,
  `gemini`, `fake`, `config.py`, factory + fallback. Tests: providers, switch. *(offline)*
- **M-C2 — Retrieval + context + safety + prompts:** port/extend current service logic into
  `cago/chatbot/`; role-aware retrieval via `dto.py`; safety classifier; VI prompts;
  `schema.py`. Tests: retrieval, roles, safety, no-data.
- **M-C3 — API endpoints + orchestrator + observability:** `cago.api.chatbot.ask_*`,
  role enforcement, response schema, `Cago Chatbot Log`. Live test all roles + refusals.
- **M-C4 — UI integration (Frappe-native):** chat panel (vanilla JS) on `/kiosk`
  ("Hỏi trợ lý") and `/staff`; renders answer_text + product_cards + safety_warnings +
  "Gọi người bán" when `needs_staff_help`.
- **M-C5 — Hardening/scale:** fallback verified, rate limiting on guest, optional FastAPI
  gateway for SSE streaming, load/latency check, retire standalone prototype.

---

## Open questions for approval

1. **Backend placement**: confirm **Option A (in-Frappe endpoints)** over the standalone
   FastAPI service? (Recommended for role-security.)
2. **Default provider** for first build: a local **Ollama/vLLM** (offline, no key, private)
   via `openai_compat`, or a hosted provider (OpenAI/Anthropic/Gemini)?
3. **Persist chat logs** in a `Cago Chatbot Log` DocType (recommended for observability) —
   OK to add the DocType?
4. **Owner chat scope**: should owner chat also answer debt/price-admin questions, or stay
   product-only for v1 (sensitive ops remain in the owner UI, not the chatbot)?

Awaiting approval before coding.
```
