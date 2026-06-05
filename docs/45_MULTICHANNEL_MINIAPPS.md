# 45 — Multi-channel customer ordering (web / PWA / Telegram / Zalo Mini App)

How the **customer ordering channel** reaches farmers, and how to roll out each surface. All
surfaces are thin frontends over the **same backend** (`cago.api.kiosk.create_wanted_list`,
`track_order`, `cago.api.staff.*` status) — see [[remote-ordering]].

## Evaluation — what's worth it for a rural VN agri shop

| Channel | Audience fit (rural VN) | Build cost | Verdict |
|---|---|---|---|
| **Public web link + PWA** (add-to-home-screen) | High — works on any phone browser, share the link via Zalo chat / QR | **Low** (already built; needs public HTTPS) | **Do first — baseline** |
| **Zalo Mini App** | **Highest** — Zalo = ~70M VN users, dominant in the countryside, trusted, low-tech friendly | **High** (separate `zmp` project + Zalo dev account/OA + app review) | **Do next (Phase 3b)** — the channel that matters most |
| **Telegram Mini App** | **Low** — Telegram is barely used by VN farmers (Zalo wins) | **Low** (just a bot + the existing public URL; app is already Telegram-ready) | **Cheap bonus** — wire it, don't prioritise |
| 3rd-party couriers (GHN/GHTK) | N/A — heavy local goods, own xe-máy delivery | — | **Skip** (see [[remote-ordering]]) |

**Recommendation:** ship the **public web/PWA** link, then invest in the **Zalo Mini App**; add
Telegram only because it's nearly free. Don't build a payment gateway (COD + VietQR + ghi nợ).

## Architecture — one host-aware app

The customer web app (`web/` kiosk routes: `/`, `/products`, `/cart`, `/track`) is **host-aware**
via `src/lib/miniapp.ts` (`initMiniApp()` runs on open): detects Telegram / Zalo / web, expands to
full height, and prefills the order form from the host identity when available. So the SAME code is:
- a normal **web page / installable PWA**, and
- a **Telegram Mini App** (Telegram injects `window.Telegram.WebApp` → we call `ready()`/`expand()`
  + read the user name), and
- embeddable in a **Zalo Mini App** shell (which calls the same backend APIs).

## Roll-out runbook (owner / dev — external setup)

### 0. Prerequisite for ALL remote channels: public HTTPS
The app currently runs on the LAN (`192.168.8.221`). Customers off-wifi can't reach it. Expose it:
- **Cloudflare Tunnel** (recommended, no public IP needed): install `cloudflared`, `cloudflared
  tunnel` → a `https://<name>.trycloudflare.com` (or a named tunnel on your domain) → point it at
  the `web` service (`:8080`/`:3000`). Owner does this at prod.
- Or a real domain + the existing Caddy TLS (docs/38).

### 1. Public web / PWA
- Share the HTTPS link (from step 0) via Zalo chat / printed QR in the shop.
- It's already a PWA (`public/manifest.webmanifest` + `sw.js`) → "Thêm vào màn hình chính".

### 2. Telegram Mini App
1. Telegram → **@BotFather** → `/newbot` (get a bot).
2. `/newapp` (or Bot Settings → Menu Button) → set the **Web App URL** to the public app URL
   (e.g. `https://…/` or `/cart`).
3. Done — opening the bot's Mini App loads our app; `initMiniApp()` handles `ready/expand`, theme,
   and name prefill. (Phone: Telegram needs a `requestContact` bot step — add later if needed.)

### 3. Zalo Mini App (Phase 3b — separate project)
A Zalo Mini App is **not** just a URL; it's a `zmp` app reviewed by Zalo:
1. Register at **Zalo for Developers** + create an **Official Account (OA)** for the shop.
2. New Mini App via **`zmp-cli`** (React). It calls **our backend** (`cago.api.kiosk.*`) over HTTPS
   (CORS/allow_guest already set for kiosk endpoints) — reuse `create_wanted_list` / `track_order`.
3. Use `zmp-sdk` `getUserInfo` / `getPhoneNumber` (with consent) to prefill name/phone, and
   ZaloPay if online payment is ever wanted (optional — COD/VietQR/ghi nợ already cover it).
4. Submit for Zalo review → publish. Customers open it from Zalo (no install).

> The `zmp` project is a separate frontend; the heavy lifting (catalog, orders, status, safety) is
> already done server-side, so it's mostly screens + the `zmp-sdk` glue.

## Telegram ops bot (owner/staff back-office — separate from the customer channel)

Beyond the *customer* Mini App, the shop's own Telegram group is a back-office console. This is the
**higher-value Telegram use** in rural VN (the owner/staff already use Telegram for chat; customers
don't). Two directions, both wired:

- **Outbound (push):** `cago.api.notify.notify_ops(text)` fans an ops alert to BOTH the owner's
  Zalo/SMS (`send_owner`) **and** the Telegram group (`notify_telegram`). Already routed for: new
  remote order (`kiosk.create_wanted_list`), call-staff alerts (`support.py`), and the daily
  việc-cần-làm digest (`alerts.py`). Each channel is best-effort and a no-op when unconfigured.
- **Inbound (commands):** `cago.api.telegram.webhook` (allow_guest) receives every message Telegram
  forwards. Read-only ops commands: `/doanhthu` (doanh thu hôm nay), `/no` (khách còn nợ),
  `/tonkho` (hàng sắp/đang hết), `/viec` (việc hôm nay), `/help`. Data is fetched under
  `privileged.as_user("Administrator")`.

**Security (two gates, both required):** the webhook is public, so it checks (1) Telegram's
`X-Telegram-Bot-Api-Secret-Token` header equals the stored `cago_telegram_webhook_secret`, and (2)
the message's `chat.id` equals the configured `cago_telegram_chat_id`. The chat-id match is the
authorization boundary — only the shop's own group can query its data; messages from any other chat
are silently ignored.

### Config — the admin-only "🔌 Kết nối & Kênh" screen
ALL channel config lives on one **admin-only** screen: `ConnectScreen` → `/pos/integrations`, Home
tile `cap:"admin"`, every endpoint `ensure_admin()` (`cago.api.integrations` + `notify` +
`telegram`). The owner (cô Tuyết) never sees tokens/secrets — only her `cago_owner_phone` stays in
the business `Settings.tsx`. Sections: 🌐 public URL · 🤖 Telegram · 💬 Zalo Mini App + ZaloPay ·
📩 Zalo/SMS relay. Secrets are masked (`has_*`); a blank secret input keeps the saved value.

Telegram wiring (no external box needed to wire, just accounts):
1. **@BotFather** → `/newbot` → copy the **Bot Token** into the Telegram section.
2. Make a Telegram **group**, add the bot, get its **Chat ID** (e.g. @userinfobot / `getUpdates`),
   paste it. Save → "📨 Gửi thử" confirms outbound.
3. Inbound commands (optional, needs the 🌐 public URL set first): "🔗 Đăng ký nhận lệnh" calls
   `telegram.set_webhook` (defaults to the stored public URL) — generates+stores the secret and
   registers with Telegram; the screen then shows `webhook_info` status / last error.

## Account linking (per-user identity ↔ Cago account)

Channel identity is linked **per user**, not by group membership:

- **Telegram (owner/staff) — built, deep-link flow:** in-app "🔗 Liên kết Telegram" (owner Settings)
  → `telegram.link_start()` mints a one-time code + `https://t.me/<bot>?start=<code>` → tapping it
  sends `/start <code>` to the bot → `telegram.webhook` maps the sender's Telegram id to that Cago
  user (`User.cago_telegram_id`, unique). From then the bot gates commands by the linked user's
  **real Cago role** (owner sees /doanhthu /no in a private chat; staff get only operational
  commands) — the manual `cago_telegram_owner_ids` allowlist remains a no-link fallback.
  `link_status()` / `unlink()` back the UI. Code is single-use, 10-min TTL (Frappe cache).
- **Zalo (customer) — server logic built (`cago.api.zalo`):** `zalo.login(access_token, phone_token,
  zalo_id)` resolves the verified phone (`_resolve_phone` exchanges the Mini App phone token with the
  Zalo Graph API using the OA app secret) → `link_customer()` finds-or-creates the Customer
  (`cago_zalo_id` + `cago_zalo_phone`). A self-registered customer is a **LEAD** (`cago_unverified=1`)
  — browse/order/cash are fine, but `debt.ensure_not_unverified` blocks buying on credit at every
  credit path (quick_sale credit + split shortfall + credit_sale + record_debt) until the owner
  clears it via `debt.verify_customer`. The token→phone exchange needs the real OA + app secret +
  HTTPS to smoke; the find-or-create + lead tiering is unit-tested (test_zalo.py).
- **Staff Telegram self-link:** the deep-link flow is now available to ALL internal users via the
  `TelegramLink` component — Home tile "🔗 Liên kết Telegram" (`/pos/link-telegram`) + the owner
  Settings card both render it.

There is **no** social OAuth login to the app itself — app login stays Frappe user/password; channel
links are an *augmentation* (recognise the user on Telegram/Zalo), not an auth provider.

## What's code-ready now vs needs the owner's accounts
- ✅ Code-ready: host-aware app (Telegram Mini App works once a bot points at the public URL), PWA,
  shared order/track/status backend; **Telegram ops bot** (outbound alerts via `notify_ops`,
  inbound `/doanhthu` `/no` `/tonkho` `/viec` commands) + its cago-admin config UI.
- ⛅ Owner/dev: Cloudflare (public HTTPS), Telegram bot token (BotFather) + group Chat ID, Zalo dev
  account + OA + the `zmp` project + Zalo review. These need external accounts and a public URL —
  can't be done/tested from the dev box. Outbound Telegram works with just a token+chat id (no public
  URL); inbound commands additionally need the public webhook (`telegram.set_webhook`).
