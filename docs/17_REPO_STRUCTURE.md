# 17 — Repository Structure

Cấu trúc thực tế của repo (cập nhật theo hệ thống đang chạy). Sản phẩm: **Cago** (cửa hàng
Minh Tuyết). Frontend là **Next.js** trong `web/`; backend là Frappe app **`cago`**.

```text
agrimate/
├── CLAUDE.md                     # chỉ dẫn cho Claude Code (quyết định kiến trúc, quy ước)
├── README.md                     # tổng quan + trỏ docs/00_INDEX.md
├── docs/                         # tài liệu — xem docs/00_INDEX.md (sử dụng / kỹ thuật / archive)
│   ├── 00_INDEX.md  user/  archive/  ...
├── prompts/                      # prompt khởi tạo dự án (lịch sử)
├── data/                         # dữ liệu mẫu/spec gốc
├── scripts/                      # tiện ích CLI: import_products, backup.sh, restore.sh, export_fixtures
│
├── web/                          # ❖ FRONTEND — Next.js 16 (App Router, TS, Tailwind), public entry
│   ├── next.config.mjs           #   proxy /api,/app,/files,/assets,/socket.io → Frappe (1 origin)
│   ├── public/  (PWA: sw.js, manifest)
│   └── src/
│       ├── app/                  #   routes: (kiosk)/  pos/  display/  login/  layout/providers/error
│       ├── components/           #   kiosk/ · staff/ · owner/ · pos/ · ui/ (+ CapabilityGuard, PwaRegister)
│       ├── lib/                  #   api.ts (frappeCall+CSRF), session, caps, types, utils(VND),
│       │                         #   kioskNav, cfd, useIsDesktop, offline/ (idb cache+queue+sync)
│       └── store/kiosk.ts        #   Zustand (giỏ kiosk, phiên chat, overlay)
│
├── frappe-apps/cago/             # ❖ BACKEND — custom Frappe app `cago` (API-first)
│   └── cago/
│       ├── api/                  #   28 module whitelisted: sales, owner, staff, kiosk, debt,
│       │                         #   purchasing, supplier, reports, shift, cashbook, coupon,
│       │                         #   inventory, display, payment, verify, units, staff_admin… (xem 39)
│       ├── chatbot/              #   orchestrator, retrieval, context, prompts, safety,
│       │                         #   deterministic (fallback keyword), providers/, config, schema
│       ├── utils/                #   dto.py (DTO theo vai trò), permissions, slug, safety…
│       ├── setup/                #   custom_fields, company, sample_data, audit, backup, test_accounts
│       ├── cago/doctype/         #   DocTypes: cago_coupon, cago_till_shift, cago_wanted_list,
│       │                         #   cago_store_map (+zone/floor/aisle), cago_job_role, cago_chatbot_log…
│       ├── fixtures/             #   custom_field.json (core product fields), roles…
│       ├── patches/  patches.txt #   migrations
│       ├── tests/                #   FrappeTestCase suite (134 tests)
│       └── hooks.py              #   after_migrate → setup_all_fields, v.v.
│
├── services/cago_chatbot_service/ # dịch vụ Python phụ trợ (tuỳ chọn, tách rời)
│
└── infra/docker/                 # ❖ TRIỂN KHAI — Docker compose
    ├── compose.yaml              #   backend(gunicorn), websocket, scheduler, queue-short/long,
    │                             #   frontend(nginx Frappe, nội bộ), web(Next.js, public), db, redis,
    │                             #   + profiles: tls(caddy) · backup
    ├── compose.override.dev.yaml #   override dev (KHÔNG tự nạp — phải build backend cho mọi đổi cago)
    ├── Dockerfile  Caddyfile  preflight.sh
    └── .env.example / .env.production.example
```

## Quy tắc luồng
- **Public entry = `web` (Next.js, cổng 8080→3000)**; nó proxy Frappe qua `frontend` (nginx nội bộ của Frappe). Backend **API-first**: `web` gọi `cago.api.*` (cookie session + CSRF).
- **Backend đổi (kể cả test) → phải `docker compose build backend`** (override dev không tự nạp). Recreate backend → restart `frontend` + `web` (nginx giữ IP upstream cũ → 502).
- DTO lọc theo vai trò trong `utils/dto.py` (staff không thấy giá vốn/lãi) — có `setup/audit.py` kiểm.

## Dữ liệu setup — 3 lớp tách bạch
Nguồn chuẩn: docstring `cago/setup/seed.py`.

1. **Migration (cấu trúc)** — chạy khi `bench migrate`/install:
   - Custom fields: `hooks.after_migrate` → `cago.setup.custom_fields.setup_all_fields`.
   - DocTypes + roles: `hooks.fixtures` (`fixtures/custom_field.json`…).
   - Vá dữ liệu: `patches.txt` (cap-roles, gán job-role mặc định…).
   → Thay **HÌNH DẠNG** DB, không phải bản ghi nghiệp vụ.

2. **Seed BẮT BUỘC** — `cago.setup.seed.seed_baseline` (idempotent), chạy khi tạo site cho **cả dev lẫn production**:
   Company + tài khoản + POS Profile + mode thanh toán · price list (Standard Selling, Giá sỉ) · cây nhóm hàng + icon/màu · Cago Job Roles mặc định. → Những thứ **không có thì app không chạy được**.

3. **Seed TUỲ CHỌN / demo** — `cago.setup.sample_data.import_sample_products` (54 sản phẩm + lô/tồn demo), gác sau `LOAD_SAMPLE_DATA`. Production khởi tạo **rỗng**, nạp catalog thật bằng CSV (`import_catalog`). KHÔNG bao giờ bắt buộc.

> `create-site` (compose): new-site → **seed_baseline (luôn)** → demo (chỉ khi `LOAD_SAMPLE_DATA=1`).

---

Xem thêm: [27](27_FRONTEND_MIGRATION_NEXTJS.md) (vì sao Next.js), [39](39_API_REFERENCE.md) (API), [40](40_FRONTEND_DEV_GUIDE.md) (dev `web/`), [38](38_GO_LIVE_RUNBOOK.md) (deploy).
