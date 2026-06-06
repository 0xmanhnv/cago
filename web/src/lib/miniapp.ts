// Host-aware mini-app layer. The SAME customer web app runs as: a public web/PWA link, a Telegram
// Mini App (opened by a bot), or — later — inside a Zalo Mini App (zmp) shell. Each host gets its
// native polish (full-screen expand, theme, identity prefill) when present; otherwise it's a normal
// web page. All hosts call the same backend (create_wanted_list / track_order / …).

type Host = "telegram" | "zalo" | "web";

let host: Host = "web";
let user: { name?: string; phone?: string } | null = null;
let inited = false;

interface TgWebApp {
  ready?: () => void;
  expand?: () => void;
  platform?: string; // "unknown" when the SDK is loaded outside Telegram
  initData?: string; // signed query string — verified server-side for one-tap login
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string; username?: string } };
}

let tgInitData = "";

/** Run once on app open (client-only, idempotent). Detects the host + grabs whatever identity the
 * host offers for prefilling the order form. Safe no-op on a plain browser. */
export function initMiniApp(): Host {
  if (inited || typeof window === "undefined") return host;
  inited = true;
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
    // The SDK is loaded on every page, so window.Telegram.WebApp also exists on a plain browser — only
    // treat this as a real Telegram Mini App when Telegram actually handed us initData / a known platform.
    const inTelegram = !!tg && (!!tg.initData || (!!tg.platform && tg.platform !== "unknown"));
    if (inTelegram && tg) {
      host = "telegram";
      tg.ready?.();
      tg.expand?.(); // use the full height inside Telegram
      tgInitData = tg.initData || ""; // for server-verified one-tap login (miniapp_login)
      const u = tg.initDataUnsafe?.user;
      if (u) user = { name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username };
      return host;
    }
    // A true Zalo Mini App runs the zmp SDK (a separate build). A plain Zalo in-app browser is just
    // a normal browser — we still tag it so analytics/UX can branch, but there's no identity API.
    if (/zalo/i.test(navigator.userAgent)) host = "zalo";
  } catch {
    /* never let host detection break the app */
  }
  return host;
}

export function miniAppHost(): Host {
  return host;
}

/** True if the Telegram WebApp SDK object is present (we're running inside Telegram), regardless of
 * whether initData was populated — used to distinguish "not in Telegram" from "in Telegram but no
 * initData" when diagnosing one-tap login. */
export function inTelegramHost(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!(window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  } catch {
    return false;
  }
}

/** Identity the host offered (Telegram user name today). Used to prefill the order form. */
export function miniAppUser(): { name?: string; phone?: string } | null {
  return user;
}

/** Telegram's signed initData string (empty unless we're inside a Telegram Mini App). The backend
 * verifies its HMAC to log the linked user in with one tap — never trust it without that check.
 * Re-reads window each call: the SDK loads afterInteractive, so it may arrive AFTER initMiniApp's
 * first (idempotent) run — without this re-read the value would be locked empty and one-tap login
 * would silently never fire. */
export function telegramInitData(): string {
  if (!tgInitData && typeof window !== "undefined") {
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      if (tg?.initData) tgInitData = tg.initData;
    } catch {
      /* ignore */
    }
  }
  return tgInitData;
}
