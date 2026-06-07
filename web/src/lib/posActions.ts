import { hasCap, isAdmin, isInternal, isOwner, type Cap } from "@/lib/caps";

// Shared registry of every back-office action + the pinned-favourites store, used by BOTH the home grid
// (Home.tsx) and the bottom tab bar (BottomNav). Kept in its own tiny module so the layout-level
// BottomNav doesn't pull the heavy Home component into every page's bundle.

// Required capability to use an action. null = any back-of-house user; "owner"/"admin" = those tiers.
export type Need = Cap | null | "owner" | "admin";
export type ActionDef = { label: string; color: string; cap: Need; href?: string; action?: "cfd" | "handover" | "setpin"; kioskOnly?: boolean };

export const ACTIONS: Record<string, ActionDef> = {
  sell: { label: "🛒 Bán hàng", color: "bg-brand", href: "/pos/sell", cap: "sell" },
  search: { label: "🔎 Tra sản phẩm", color: "bg-blue-600", href: "/pos/search", cap: null },
  returns: { label: "↩️ Trả / Đổi hàng", color: "bg-rose-600", href: "/pos/returns", cap: "returns" },
  exchange: { label: "↔️ Đổi hàng", color: "bg-rose-500", href: "/pos/exchange", cap: "returns" },
  orders: { label: "📋 Khách đã chọn", color: "bg-teal-600", href: "/pos/orders", cap: null },
  saleshistory: { label: "🧾 Đơn hàng", color: "bg-blue-600", href: "/pos/sales", cap: "returns" },
  support: { label: "🛎️ Khách cần hỗ trợ", color: "bg-rose-600", href: "/pos/support", cap: "sell" },
  assistant: { label: "🤖 Hỏi trợ lý", color: "bg-violet-600", href: "/pos/assistant", cap: null },
  help: { label: "📖 Hướng dẫn", color: "bg-sky-600", href: "/pos/help", cap: null },
  coupons: { label: "🎟 Mã giảm giá", color: "bg-violet-600", href: "/pos/coupons", cap: "settings" },
  settings: { label: "⚙️ Cài đặt cửa hàng", color: "bg-violet-600", href: "/pos/settings", cap: "settings" },
  storeinfo: { label: "🏪 Thông tin cửa hàng", color: "bg-violet-500", href: "/pos/store", cap: "settings" },
  price: { label: "🔎 Tra giá / sửa giá", color: "bg-blue-600", href: "/pos/price", cap: "products" },
  new: { label: "➕ Thêm sản phẩm", color: "bg-teal-600", href: "/pos/products/new", cap: "products" },
  edit: { label: "✏️ Sửa sản phẩm", color: "bg-amber-500", href: "/pos/edit", cap: "products" },
  product: { label: "📦 Sản phẩm", color: "bg-blue-600", href: "/pos/products", cap: "products" },
  recommended: { label: "⭐ Hàng khuyên dùng", color: "bg-amber-500", href: "/pos/recommended", cap: "products" },
  receive: { label: "📥 Nhập hàng", color: "bg-teal-700", href: "/pos/receive", cap: "stock" },
  bulk: { label: "⚡ Nhập hàng loạt", color: "bg-teal-700", href: "/pos/bulk", cap: "stock" },
  receivehist: { label: "📜 Lịch sử nhập", color: "bg-teal-600", href: "/pos/receive-history", cap: "stock" },
  alerts: { label: "🔔 Cảnh báo hôm nay", color: "bg-amber-600", href: "/pos/alerts", cap: "stock" },
  lowstock: { label: "📦 Hàng sắp hết", color: "bg-teal-600", href: "/pos/low-stock", cap: "stock" },
  reorder: { label: "🛒 Gợi ý nhập hàng", color: "bg-teal-700", href: "/pos/reorder", cap: "stock" },
  expiry: { label: "⏰ Lô & hạn dùng", color: "bg-orange-600", href: "/pos/expiry", cap: "stock" },
  labels: { label: "🏷 In tem giá", color: "bg-blue-600", href: "/pos/labels", cap: "products" },
  categories: { label: "🗂 Loại hàng", color: "bg-teal-600", href: "/pos/categories", cap: "products" },
  map: { label: "🗺 Sơ đồ cửa hàng", color: "bg-teal-600", href: "/pos/map", cap: "settings" },
  recordpay: { label: "💵 Khách trả nợ", color: "bg-brand", href: "/pos/record-payment", cap: "debt" },
  recorddebt: { label: "📝 Ghi nợ (chỉ tiền)", color: "bg-red-500", href: "/pos/record-debt", cap: "debt" },
  debt: { label: "📒 Công nợ khách", color: "bg-violet-600", href: "/pos/debt", cap: "debt_view" },
  verify: { label: "🙋 Xem nợ khách", color: "bg-amber-500", href: "/pos/verify", cap: "debt_view" },
  supplier: { label: "🚚 Nhà cung cấp", color: "bg-violet-500", href: "/pos/suppliers", cap: "supplier" },
  cashbook: { label: "🧮 Chốt ca / Sổ quỹ", color: "bg-blue-700", href: "/pos/cashbook", cap: "cash" },
  reports: { label: "📊 Báo cáo", color: "bg-blue-600", href: "/pos/reports", cap: "reports" },
  unsafe: { label: "⚠️ Câu hỏi cần lưu ý", color: "bg-amber-600", href: "/pos/unsafe", cap: "reports" },
  insights: { label: "🤖 Trợ lý học gì", color: "bg-violet-600", href: "/pos/assistant-insights", cap: "reports" },
  aicontent: { label: "✍️ Dạy trợ lý trả lời", color: "bg-violet-500", href: "/pos/assistant-content", cap: "reports" },
  health: { label: "🩺 Kiểm tra dữ liệu", color: "bg-blue-600", href: "/pos/health", cap: "products" },
  aisettings: { label: "🤖 Cấu hình trợ lý AI", color: "bg-slate-600", href: "/pos/ai-settings", cap: "admin" },
  integrations: { label: "🔌 Kết nối & Kênh", color: "bg-slate-600", href: "/pos/integrations", cap: "admin" },
  telegramlink: { label: "🔗 Liên kết mạng xã hội", color: "bg-sky-600", href: "/pos/link-telegram", cap: null },
  staffadmin: { label: "👥 Nhân viên & quyền", color: "bg-slate-600", href: "/pos/staff", cap: "owner" },
  backup: { label: "💾 Sao lưu dữ liệu", color: "bg-slate-600", href: "/pos/backup", cap: "admin" },
  readiness: { label: "🚩 Sẵn sàng khai trương?", color: "bg-emerald-700", href: "/pos/readiness", cap: "owner" },
  tabbar: { label: "📱 Sửa thanh dưới", color: "bg-slate-600", href: "/pos/tabbar", cap: null },
  cfd: { label: "🖥 Màn hình phụ cho khách", color: "bg-slate-700", cap: "sell", action: "cfd" },
  handover: { label: "🧑‍🌾 Màn hình khách", color: "bg-emerald-600", cap: null, action: "handover", kioskOnly: true },
  setpin: { label: "🔒 Đổi mã PIN", color: "bg-violet-600", cap: null, action: "setpin", kioskOnly: true },
};

// A pinned home tile / tab-bar shortcut: which action + how wide (1 = half, 2 = full row on the grid).
export type Fav = { k: string; w: 1 | 2 };
export const FAV_CACHE = "cago_fav_cache";

type Boot = Parameters<typeof isInternal>[0];

// Capability gate for the bottom-nav / favourites — the core of Home's `can` (without the kiosk-device
// and staff-debt kill-switch; the bar only surfaces what the owner already pinned for their own role).
export function canRunAction(a: ActionDef | undefined, boot: Boot): boolean {
  if (!a) return false;
  if (a.cap === null) return isInternal(boot);
  if (a.cap === "owner") return isOwner(boot);
  if (a.cap === "admin") return isAdmin(boot);
  return hasCap(boot, a.cap);
}

// Read the owner's pinned favourites straight from the same localStorage cache Home writes.
export function readFavorites(): Fav[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(FAV_CACHE) : null;
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// The bottom tab bar is configured SEPARATELY from "⭐ Hay dùng" (different purpose: a small, stable set
// of nav shortcuts vs the home favourites). Stored per-device in localStorage; "Trang chủ" is implicit.
export const TABBAR_CACHE = "cago_tabbar";
export const TABBAR_MAX = 4;
export const TABBAR_CHANGED_EVENT = "cago-tabbar-changed";

export function readTabbar(): string[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(TABBAR_CACHE) : null;
    const a = raw ? JSON.parse(raw) : null;
    return Array.isArray(a) ? a.filter((k): k is string => typeof k === "string" && !!ACTIONS[k]?.href).slice(0, TABBAR_MAX) : [];
  } catch {
    return [];
  }
}

export function writeTabbar(keys: string[]): void {
  try {
    window.localStorage?.setItem(TABBAR_CACHE, JSON.stringify(keys.slice(0, TABBAR_MAX)));
    window.dispatchEvent(new Event(TABBAR_CHANGED_EVENT)); // let the live BottomNav re-read immediately
  } catch {
    /* ignore */
  }
}

// "🛒 Bán hàng" → { icon: "🛒", label: "Bán hàng" }; long labels trimmed at the first  / ( ·  for a tab.
export function tabParts(label: string): { icon: string; label: string } {
  const sp = label.indexOf(" ");
  const icon = sp > 0 ? label.slice(0, sp) : "•";
  const text = (sp > 0 ? label.slice(sp + 1) : label).split(/\s*[/(·]\s*/)[0].trim();
  return { icon, label: text };
}
