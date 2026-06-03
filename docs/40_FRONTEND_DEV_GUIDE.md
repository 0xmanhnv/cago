# 40 — Frontend Dev Guide (`web/`)

Hướng dẫn cho người phát triển frontend. App là **Next.js 16 (App Router, TypeScript)** trong
`web/`, là **public entry** và proxy Frappe qua một origin (xem [27](27_FRONTEND_MIGRATION_NEXTJS.md)).

## Chạy local
```bash
cd web
npm install
npm run dev        # http://localhost:3000  (cần backend Frappe đang chạy — xem infra/docker)
npm run lint
npm run test       # vitest (caps.test, storemap.test, utils.test)
npm run build      # build production (typecheck + lint chặn lỗi)
```
- `FRAPPE_INTERNAL_URL` (production, trong container) trỏ tới nginx Frappe nội bộ. Local: Next rewrite proxy sang backend (xem `next.config.mjs`).
- Build production chạy qua Docker: `infra/docker` → image `cago/web` (xem [38](38_GO_LIVE_RUNBOOK.md)).

## Cấu trúc `src/`
- **`app/`** — route (App Router):
  - `(kiosk)/` — khách: `/`, `/products`, `/cart`, `/assistant`, `/my-debt`, `/map`…
  - `pos/` — chủ & nhân viên: `/pos`, `/pos/sell`, `/pos/products`, `/pos/debt`, `/pos/backup`…
  - `display/` — màn hình phụ cho khách (CFD); `login/`; `layout.tsx`, `providers.tsx`, `error.tsx`.
- **`components/`** — `kiosk/`, `staff/`, `owner/`, `pos/`, `ui/` (Sheet/dialog/toast/Skeleton/CategoryNav…).
- **`lib/`** — `api.ts` (gọi Frappe + CSRF), `session.tsx` (bootstrap context), `caps.ts` (kiểm capability), `types.ts` (DTO types), `utils.ts` (VND helpers…), `kioskNav.ts`, `cfd.ts`, `useIsDesktop.ts`, `useLockBodyScroll.ts`, `offline/` (idb cache + queue + sync).
- **`store/kiosk.ts`** — Zustand store (giỏ kiosk, phiên chat, overlay trợ lý/gọi NV).

## Quy ước (đọc kỹ — đã thống nhất qua nhiều vòng)
- **Định danh tiếng Anh**, chỉ text UI tiếng Việt.
- **Tiền VND:** luôn dùng `formatVnd/parseVnd/groupVnd` từ `lib/utils`. **Không** `parseFloat` chuỗi đã nhóm ("1.000" → 1 là bug).
- **Gọi API:** qua `frappeCall(...)` trong `lib/api.ts` (tự gắn CSRF). DTO trả về đã lọc theo vai trò — đừng tự đoán field nhạy cảm.
- **Hydration-safe:** KHÔNG đọc `sessionStorage`/`matchMedia` lúc module-init (lệch SSR → màn chết). Hydrate trong effect sau mount; xem `useIsDesktop`, `store/kiosk` hydrate, ghi chú trong `KioskChrome`.
- **Responsive:** ưu tiên cảm ứng (mobile/tablet); chỉ nới rộng + nhiều cột ở màn lớn (`xl:`). Form giữ cột hẹp (`max-w`).
- **Offline (màn Bán):** `lib/offline/*` — cache catalog/khách (idb), hàng đợi đơn, tự đồng bộ; `client_uuid` chống trùng. Chỉ tiền mặt + ghi nợ khi offline.
- **Capability:** `hasCap(boot, cap)` quyết định hiện nút; server vẫn enforce — đừng dựa vào ẩn UI để bảo mật.
- **Bản quyền:** header 0xManhnv; comment không nhắc Claude/CLAUDE.md.

## Deploy
Đổi code frontend → `docker compose build web` → `up -d web frontend`. Recreate backend thì
**phải restart `frontend` + `web`** (nginx Frappe nội bộ giữ IP upstream cũ → 502). Xem
[38](38_GO_LIVE_RUNBOOK.md) + [33](33_OPERATIONS_RESTORE_ROLLBACK.md).
