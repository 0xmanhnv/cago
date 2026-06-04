"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { frappeCall, logout } from "@/lib/api";
import { useSession } from "@/lib/session";
import { hasCap, isInternal, isOwner, type Cap } from "@/lib/caps";
import { BrandHeader } from "@/components/ui/BrandHeader";
import { confirmDialog } from "@/components/ui/dialog";
import { isFixedKiosk } from "@/components/kiosk/StoreMapView";
import { lockPos } from "@/lib/posLock";
import { SetPinDialog } from "./SetPinDialog";

interface Digest {
  out_of_stock: number;
  low_stock: number;
  expiring: number;
  debtors: number;
  debt_total_text: string;
  has_tasks: boolean;
}

interface Onboarding {
  steps: { key: string; label: string; done: boolean; href: string }[];
  done: number;
  total: number;
  all_done: boolean;
}

// Required capability to use an action. null = any back-of-house user (shared); "owner" = owner only.
type Need = Cap | null | "owner";

// One registry of every back-office action. Tiles render only when the user holds the capability;
// groups/favorites reference these by key. Most navigate (`href`); a few run a local handler
// (`action`) instead. `kioskOnly` = only on a shared kiosk+POS device (cago_fixed_kiosk).
type ActionDef = { label: string; color: string; cap: Need; href?: string; action?: "cfd" | "handover" | "setpin"; kioskOnly?: boolean };
const ACTIONS: Record<string, ActionDef> = {
  sell: { label: "🛒 Bán hàng", color: "bg-brand", href: "/pos/sell", cap: "sell" },
  search: { label: "🔎 Tra sản phẩm", color: "bg-blue-600", href: "/pos/search", cap: null },
  returns: { label: "↩️ Trả / Đổi hàng", color: "bg-rose-600", href: "/pos/returns", cap: "returns" },
  exchange: { label: "🔁 Đổi hàng", color: "bg-rose-500", href: "/pos/exchange", cap: "returns" },
  orders: { label: "📋 Khách đã chọn", color: "bg-teal-600", href: "/pos/orders", cap: null },
  assistant: { label: "🤖 Hỏi trợ lý", color: "bg-violet-600", href: "/pos/assistant", cap: null },
  help: { label: "📖 Hướng dẫn", color: "bg-sky-600", href: "/pos/help", cap: null },
  coupons: { label: "🎟 Mã giảm giá", color: "bg-violet-600", href: "/pos/coupons", cap: "settings" },
  qr: { label: "💳 QR thu tiền", color: "bg-violet-600", href: "/pos/settings", cap: "settings" },
  price: { label: "🔎 Tra giá / sửa giá", color: "bg-blue-600", href: "/pos/price", cap: "products" },
  new: { label: "➕ Thêm sản phẩm", color: "bg-teal-600", href: "/pos/products/new", cap: "products" },
  edit: { label: "✏️ Sửa sản phẩm", color: "bg-amber-500", href: "/pos/edit", cap: "products" },
  product: { label: "📦 Sản phẩm (tra giá · thêm · sửa)", color: "bg-blue-600", href: "/pos/products", cap: "products" },
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
  supplier: { label: "🚚 Công nợ NCC", color: "bg-violet-500", href: "/pos/supplier-debt", cap: "supplier" },
  cashbook: { label: "🧮 Chốt ca / Sổ quỹ", color: "bg-blue-700", href: "/pos/cashbook", cap: "cash" },
  reports: { label: "📊 Báo cáo", color: "bg-blue-600", href: "/pos/reports", cap: "reports" },
  unsafe: { label: "⚠️ Câu hỏi cần lưu ý", color: "bg-amber-600", href: "/pos/unsafe", cap: "reports" },
  health: { label: "🩺 Kiểm tra dữ liệu", color: "bg-blue-600", href: "/pos/health", cap: "products" },
  aisettings: { label: "🤖 Cấu hình trợ lý AI", color: "bg-slate-600", href: "/pos/ai-settings", cap: "owner" },
  staffadmin: { label: "👥 Nhân viên & quyền", color: "bg-slate-600", href: "/pos/staff", cap: "owner" },
  backup: { label: "💾 Sao lưu dữ liệu", color: "bg-slate-600", href: "/pos/backup", cap: "owner" },
  cfd: { label: "🖥 Màn hình phụ cho khách", color: "bg-slate-700", cap: "sell", action: "cfd" },
  handover: { label: "🧑‍🌾 Màn hình khách", color: "bg-emerald-600", cap: null, action: "handover", kioskOnly: true },
  setpin: { label: "🔒 Đổi mã PIN", color: "bg-violet-600", cap: null, action: "setpin", kioskOnly: true },
};
// A pinned home tile: which action + how wide (1 = half, 2 = full row on the 2-col grid).
type Fav = { k: string; w: 1 | 2 };

const FAV_CACHE = "cago_fav_cache";
const SHOW_ALL_KEY = "cago_show_all"; // remember whether the owner expanded "Tất cả chức năng"
const savedShowAll = () => { try { return window.localStorage?.getItem(SHOW_ALL_KEY) === "1"; } catch { return false; } };
// Hydrate from the local cache BEFORE the browser paints (layout effect), so the "⭐ Hay dùng" tiles
// appear in the very first frame instead of fetching from the server and popping in (layout shift /
// jank). Server stays the source of truth — the mount effect revalidates + rewrites the cache.
// Isomorphic: useEffect on the server (no-op) avoids the SSR "useLayoutEffect" warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Grouped into families by frequency: daily actions first, one-time setup last. Items merged into a
// hub screen (product = thêm/sửa/tra giá; receive links to bulk; returns links to exchange; reorder
// covers low-stock) are dropped from the home catalog but their routes + ACTIONS stay (so pinned
// favourites and deep links still resolve).
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "🛒 Bán hàng", keys: ["sell", "search", "returns", "orders", "assistant"] },
  { title: "📦 Sản phẩm", keys: ["product", "recommended", "labels", "health"] },
  { title: "🏬 Kho & nhập hàng", keys: ["alerts", "receive", "reorder", "expiry", "receivehist"] },
  { title: "📒 Công nợ & sổ quỹ", keys: ["debt", "recordpay", "recorddebt", "verify", "supplier", "cashbook"] },
  { title: "📊 Báo cáo", keys: ["reports", "unsafe"] },
  { title: "⚙️ Cài đặt cửa hàng", keys: ["categories", "map", "coupons", "qr", "aisettings", "staffadmin", "backup", "help"] },
  { title: "🖥 Màn hình & thiết bị", keys: ["cfd", "handover", "setpin"] },
];

export function PosHome() {
  const router = useRouter();
  const { boot, reload } = useSession();
  const owner = isOwner(boot);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestLoaded, setDigestLoaded] = useState(false); // false → show a reserved-height skeleton (no jump)
  const [onboard, setOnboard] = useState<Onboarding | null>(null);
  const [onboardHidden, setOnboardHidden] = useState(true);
  const [cfdToken, setCfdToken] = useState("");
  const [fav, setFav] = useState<Fav[]>([]);
  const [favLoaded, setFavLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [kioskDevice, setKioskDevice] = useState(false); // shared kiosk+POS touchscreen (cago_fixed_kiosk)
  const [showSetPin, setShowSetPin] = useState(false);
  const [showHandover, setShowHandover] = useState(false); // "give the screen to a customer" chooser
  const [lockAfterPin, setLockAfterPin] = useState(false); // set a PIN then immediately lock + hand over
  const editRef = useRef(false);
  const lp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const justLong = useRef(false);
  editRef.current = editMode;

  // Whether THIS user may use an action (owner sees all; null = any internal). kioskOnly actions
  // only show on a shared kiosk+POS device.
  const can = (k: string) => {
    const a = ACTIONS[k];
    if (!a) return false;
    if (a.kioskOnly && !kioskDevice) return false;
    if (a.cap === null) return isInternal(boot);
    if (a.cap === "owner") return owner;
    return hasCap(boot, a.cap);
  };

  // Run an action: navigate (href) or fire a local handler. Used by both pinned favorites and the
  // grouped menu so the device/screen actions can be pinned to ⭐ Hay dùng like any other.
  const runAction = (k: string) => {
    const a = ACTIONS[k];
    if (!a) return;
    if (a.action === "cfd") { window.open(`/display${cfdToken ? `?k=${cfdToken}` : ""}`, "_blank", "noopener"); return; }
    if (a.action === "handover") { handover(); return; }
    if (a.action === "setpin") { setShowSetPin(true); return; }
    if (a.href) router.push(a.href);
  };

  const pressStart = () => {
    if (editRef.current) return;
    lp.current = setTimeout(() => {
      justLong.current = true;
      setEditMode(true);
      try { navigator.vibrate?.(15); } catch { /* ignore */ }
    }, 450);
  };
  const pressCancel = () => clearTimeout(lp.current);
  const tapTile = (k: string) => {
    if (justLong.current) { justLong.current = false; return; }
    if (editRef.current) { togglePin(k); return; }
    runAction(k);
  };
  useEffect(() => () => clearTimeout(lp.current), []);

  // Detect a shared kiosk+POS device (client-only → hydration-safe) to offer the hand-over button
  // + quick-sell PIN. PIN presence comes from the server bootstrap (boot.has_pos_pin).
  useEffect(() => {
    setKioskDevice(isFixedKiosk());
  }, []);

  // Hand the screen to a customer. If a PIN is already set → lock (server) and go straight to the
  // kiosk (no prompt). If not, open the chooser so the owner can set a PIN+lock or log out fully.
  const handover = async () => {
    if (boot?.has_pos_pin) {
      await lockPos();
      window.location.href = "/";
    } else {
      setShowHandover(true);
    }
  };
  const lockWithPin = async () => {
    if (boot?.has_pos_pin) {
      await lockPos();
      window.location.href = "/";
    } else {
      setShowHandover(false);
      setLockAfterPin(true);
      setShowSetPin(true);
    }
  };
  const logoutHandover = async () => {
    try {
      await logout();
    } finally {
      window.location.href = "/";
    }
  };

  // Paint the cached favorites immediately (pre-paint) → no pop-in on entering/returning home.
  useIsoLayoutEffect(() => {
    try {
      const raw = window.localStorage?.getItem(FAV_CACHE);
      if (raw) {
        const a = (JSON.parse(raw) as Fav[]).filter((f) => f && ACTIONS[f.k]);
        if (Array.isArray(a)) { setFav(a); setFavLoaded(true); setShowAll(a.length ? savedShowAll() : true); }
      }
    } catch { /* ignore a corrupt cache */ }
  }, []);

  useEffect(() => {
    if (!owner) return;
    // First-run checklist — only while not all done and the owner hasn't dismissed it.
    const dismissed = (() => { try { return window.localStorage?.getItem("cago_onboard_done") === "1"; } catch { return false; } })();
    if (dismissed) return;
    frappeCall<Onboarding>("cago.api.alerts.onboarding_status", {}, { method: "GET" })
      .then((o) => {
        setOnboard(o);
        setOnboardHidden(o.all_done);
        if (o.all_done) { try { window.localStorage?.setItem("cago_onboard_done", "1"); } catch { /* ignore */ } }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  useEffect(() => {
    if (hasCap(boot, "sell")) {
      frappeCall<{ token: string }>("cago.api.display.cfd_token", {}, { method: "GET" }).then((r) => setCfdToken(r.token || "")).catch(() => {});
    }
  }, [boot]);

  useEffect(() => {
    frappeCall<Digest>("cago.api.reports.daily_digest", {}, { method: "GET" })
      .then((d) => { setDigest(d); setDigestLoaded(true); })
      .catch(() => setDigestLoaded(true));
    // Saved favorites: new format = [{k,w}]; legacy = ["key", ...] (treated as width 1).
    frappeCall<(string | Fav)[]>("cago.api.prefs.get_home_favorites", {}, { method: "GET" })
      .then((saved) => {
        const a: Fav[] = Array.isArray(saved)
          ? saved
              .map((it): Fav => (typeof it === "string" ? { k: it, w: 1 } : { k: it.k, w: it.w === 2 ? 2 : 1 }))
              .filter((f) => ACTIONS[f.k])
          : [];
        setFav(a);
        setShowAll(a.length ? savedShowAll() : true);
        setFavLoaded(true);
        try { window.localStorage?.setItem(FAV_CACHE, JSON.stringify(a)); } catch { /* ignore */ }
      })
      .catch(() => { setShowAll(true); setFavLoaded(true); });
  }, []);

  const persist = (next: Fav[]) => {
    frappeCall("cago.api.prefs.set_home_favorites", { keys: JSON.stringify(next) }).catch(() => {});
  };
  const saveFav = (next: Fav[]) => {
    setFav(next);
    persist(next);
  };
  const togglePin = (key: string) => saveFav(fav.some((f) => f.k === key) ? fav.filter((f) => f.k !== key) : [...fav, { k: key, w: 1 }]);
  const setWidth = (key: string, w: 1 | 2) => saveFav(fav.map((f) => (f.k === key ? { ...f, w } : f)));
  // Render only favorites the user can still access (filtered at render → no boot/load race; the
  // full list stays in `fav`/storage so a tile reappears if the capability is granted back).
  const visFav = fav.filter((f) => ACTIONS[f.k] && can(f.k));
  const favKeys = new Set(visFav.map((f) => f.k)); // to hide pinned tiles from the lists below
  const hasFav = visFav.length > 0;
  // No favorites (and not arranging) → the full menu IS the page, shown expanded with no toggle.
  // Gate on favLoaded: before favorites arrive we keep the groups COLLAPSED, so a user WITH
  // favorites never sees the list flash open then animate shut (the jank) on entering/returning home.
  const groupsOpen = favLoaded && (!hasFav || editMode || showAll);

  // Smooth drag-to-reorder via dnd-kit (lift + neighbours slide + snap on drop, like iOS).
  // Small distance constraint so tapping the ↔/★ buttons doesn't start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = fav.findIndex((f) => f.k === active.id);
    const newI = fav.findIndex((f) => f.k === over.id);
    if (oldI >= 0 && newI >= 0) saveFav(arrayMove(fav, oldI, newI));
  };

  const doLogout = async () => {
    if (!(await confirmDialog("Đăng xuất khỏi máy này?", { danger: true, confirmLabel: "Đăng xuất" }))) return;
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  };

  const Tile = ({ k, wide = false }: { k: string; wide?: boolean }) => {
    const a = ACTIONS[k];
    const pinned = fav.some((f) => f.k === k);
    return (
      <div className={`relative ${wide ? "col-span-2" : ""} ${editMode ? "animate-jiggle" : ""}`}>
        <button
          onClick={() => tapTile(k)}
          onPointerDown={pressStart}
          onPointerUp={pressCancel}
          onPointerMove={pressCancel}
          onPointerLeave={pressCancel}
          className={`mt-tile w-full ${a.color} ${editMode ? "ring-2 ring-white/70" : ""}`}
        >
          {a.label}
        </button>
        {editMode && (
          <span
            onClick={(e) => { e.stopPropagation(); togglePin(k); }}
            aria-label={pinned ? "Bỏ ghim" : "Ghim lên Hay dùng"}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/30 text-sm text-white shadow"
          >
            {pinned ? "★" : "☆"}
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      <BrandHeader subtitle={owner ? "Chủ cửa hàng" : boot?.full_name ? `Nhân viên · ${boot.full_name}` : "Nhân viên"} />

      {owner && onboard && !onboardHidden && (
        <div className="mb-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-brand-dark">🚀 Bắt đầu nhanh ({onboard.done}/{onboard.total})</div>
            <button
              onClick={() => { setOnboardHidden(true); try { window.localStorage?.setItem("cago_onboard_done", "1"); } catch { /* ignore */ } }}
              className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-500 shadow-sm"
            >
              Ẩn
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {onboard.steps.map((s) => (
              <button
                key={s.key}
                onClick={() => !s.done && router.push(s.href)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold ${s.done ? "bg-white/60 text-slate-400" : "bg-white text-brand-dark shadow-sm"}`}
              >
                <span>{s.done ? "✅" : "⬜"}</span>
                <span className={s.done ? "line-through" : ""}>{s.label}</span>
                {!s.done && <span className="ml-auto text-slate-300">›</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reserve the slot from the first frame so the async digest never shifts the page. While
          loading we show a neutral skeleton (NOT stale numbers, so there's no value-flip); once
          loaded we show the real tasks, or a compact all-clear note of the same height. */}
      {!digestLoaded ? (
        <div className="mb-3 animate-pulse rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3" aria-hidden>
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 rounded bg-amber-200/70" />
            <div className="h-6 w-20 rounded-full bg-white/80" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="h-8 w-32 rounded-lg bg-white/80" />
            <div className="h-8 w-28 rounded-lg bg-white/80" />
            <div className="h-8 w-36 rounded-lg bg-white/80" />
          </div>
        </div>
      ) : digest?.has_tasks ? (
        <div className="mb-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-amber-800">📌 Việc cần làm hôm nay</div>
            <button onClick={() => router.push("/pos/alerts")} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-800 shadow-sm">Xem tất cả ›</button>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {digest.out_of_stock > 0 && (
              <button onClick={() => router.push("/pos/alerts")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-700 shadow">🔴 {digest.out_of_stock} mặt hàng đang hết</button>
            )}
            {digest.low_stock > 0 && (
              <button onClick={() => router.push("/pos/low-stock")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-amber-800 shadow">🟠 {digest.low_stock} hàng sắp hết</button>
            )}
            {digest.expiring > 0 && (
              <button onClick={() => router.push("/pos/expiry")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-orange-700 shadow">⏰ {digest.expiring} lô sắp hết hạn</button>
            )}
            {digest.debtors > 0 && (
              <button onClick={() => router.push("/pos/debt")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-700 shadow">📒 {digest.debtors} khách nợ · {digest.debt_total_text}</button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
          ✅ Hôm nay không có việc gấp
        </div>
      )}

      {/* One header row always offers "Sắp xếp" (so the owner can pin even with nothing pinned yet).
          When nothing is pinned, the ⭐ section + its empty box are hidden and the full menu shows
          directly below (no toggle) — no awkward empty gap. */}
      <div className="mb-1 ml-1 mt-1 flex items-center justify-between">
        <div className="text-lg font-extrabold text-brand-dark">{hasFav || editMode ? "⭐ Hay dùng" : "🧰 Chức năng"}</div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`rounded-full px-3 py-1 text-sm font-bold ${editMode ? "bg-brand text-white" : "bg-white text-brand-dark shadow-sm"}`}
        >
          {editMode ? "✓ Xong" : "✏️ Sắp xếp"}
        </button>
      </div>
      {editMode && (
        <div className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-800">
          Kéo <b>⠿</b> đổi chỗ · <b>↔</b> đổi cỡ (rộng/hẹp) · <b>★</b> bỏ ghim · ☆ bên dưới để ghim · xong bấm <b>Xong</b>.
        </div>
      )}
      {editMode ? (
        visFav.length === 0 ? (
          <div className="mb-4 rounded-2xl border-2 border-dashed border-emerald-200 bg-white/60 p-4 text-center text-slate-500">
            Chạm ☆ trên một mục bên dưới để ghim lên đây.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visFav.map((f) => f.k)} strategy={rectSortingStrategy}>
              <div className="mb-4 grid grid-cols-2 gap-3.5">
                {visFav.map((f) => (
                  <SortableFav key={f.k} f={f} onWidth={setWidth} onUnpin={togglePin} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )
      ) : hasFav ? (
        <div className="mb-4 grid grid-cols-2 gap-3.5">
          {visFav.map((f) => {
            const a = ACTIONS[f.k];
            if (!a) return null;
            return (
              <button
                key={f.k}
                onClick={() => runAction(f.k)}
                onPointerDown={pressStart}
                onPointerUp={pressCancel}
                onPointerMove={pressCancel}
                onPointerLeave={pressCancel}
                className={`mt-tile w-full ${f.w === 2 ? "col-span-2" : ""} ${a.color}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* The "Tất cả chức năng" collapse only makes sense when there ARE favorites; otherwise the
          full menu is the page, shown directly. */}
      {hasFav && !editMode && (
        <button
          onClick={() => setShowAll((v) => { const n = !v; try { window.localStorage?.setItem(SHOW_ALL_KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; })}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-white py-3 text-lg font-extrabold text-brand-dark"
        >
          🧰 Tất cả chức năng <span className={`inline-block transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}>▾</span>
        </button>
      )}

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${groupsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden" inert={!groupsOpen ? true : undefined}>
          {GROUPS.map((g) => {
            // Only the actions this user may use AND that aren't already pinned to ⭐ Hay dùng
            // (no duplication: pinned above ⇒ hidden here, and vice-versa).
            const keys = g.keys.filter((k) => can(k) && !favKeys.has(k));
            if (!keys.length) return null; // hide an empty group entirely
            const lastOdd = keys.length % 2 === 1;
            return (
              <div key={g.title} className="mb-3">
                <div className="mb-1.5 ml-1 text-base font-bold text-slate-500">{g.title}</div>
                <div className="grid grid-cols-2 gap-3.5">
                  {keys.map((k, idx) => (
                    <Tile key={k} k={k} wide={lastOdd && idx === keys.length - 1} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🖥 Màn hình phụ / 🧑‍🌾 Màn hình khách / 🔒 Đổi mã PIN are now first-class actions in the
          "Màn hình & thiết bị" group above, so they can be pinned to ⭐ Hay dùng like any other. */}

      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        {owner && (
          <a href="/app" target="_blank" rel="noopener" className="mt-tile min-h-[64px] bg-slate-500 text-lg">⚙️ Quản lý ERPNext</a>
        )}
        <button onClick={doLogout} className={`mt-tile min-h-[64px] bg-red-600 text-lg ${owner ? "" : "col-span-2"}`}>🚪 Đăng xuất</button>
      </div>

      {showHandover && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-5" onClick={() => setShowHandover(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">🧑‍🌾</div>
            <div className="mt-2 text-xl font-extrabold text-brand-dark">Giao máy cho khách</div>
            <div className="mt-1 text-sm text-slate-500">Chọn cách bảo vệ trước khi đưa máy cho khách xem.</div>
            <div className="mt-5 flex flex-col gap-3">
              {/* The chooser only opens when the current cashier has no PIN yet. Any staff/owner can
                  set their OWN PIN, then it's a one-tap lock next time. */}
              <button onClick={lockWithPin} className="rounded-2xl bg-emerald-600 p-3.5 text-left text-white">
                <div className="text-lg font-extrabold">🔒 Đặt mã PIN & khoá</div>
                <div className="text-xs font-medium text-white/85">Giữ phiên — quay lại bán chỉ cần nhập mã PIN.</div>
              </button>
              <button onClick={logoutHandover} className="rounded-2xl bg-red-600 p-3.5 text-left text-white">
                <div className="text-lg font-extrabold">🚪 Đăng xuất</div>
                <div className="text-xs font-medium text-white/85">Thoát hẳn — quay lại phải đăng nhập đầy đủ.</div>
              </button>
              <button onClick={() => setShowHandover(false)} className="min-h-[48px] rounded-2xl bg-slate-100 font-bold text-slate-600">Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {showSetPin && (
        <SetPinDialog
          onClose={async () => {
            setShowSetPin(false);
            // "Đặt mã PIN & khoá" flow: a PIN now exists → lock (server) and hand the screen over.
            if (lockAfterPin) {
              setLockAfterPin(false);
              const b = await reload();
              if (b?.has_pos_pin) {
                await lockPos();
                window.location.href = "/";
              }
            }
          }}
        />
      )}
    </div>
  );
}

// A pinned favorite in arrange mode — dnd-kit sortable (smooth lift + slide). The ⠿ handle is the
// only drag initiator, so the ↔ (width) and ★ (unpin) buttons stay tappable.
function SortableFav({ f, onWidth, onUnpin }: { f: Fav; onWidth: (k: string, w: 1 | 2) => void; onUnpin: (k: string) => void }) {
  const a = ACTIONS[f.k];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.k });
  if (!a) return null;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${f.w === 2 ? "col-span-2" : ""} ${isDragging ? "z-30 opacity-90 shadow-2xl" : ""}`}
    >
      <div className={`mt-tile w-full select-none pl-9 pr-[4.5rem] ring-2 ring-white/70 ${a.color}`}>{a.label}</div>
      <span
        {...attributes}
        {...listeners}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab touch-none select-none px-1 text-xl text-white/90"
        aria-label="Kéo để sắp xếp"
      >
        ⠿
      </span>
      <span
        onClick={() => onWidth(f.k, f.w === 2 ? 1 : 2)}
        aria-label={f.w === 2 ? "Thu hẹp" : "Mở rộng"}
        className="absolute right-9 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/30 text-sm font-bold text-white shadow"
      >
        ↔
      </span>
      <span
        onClick={() => onUnpin(f.k)}
        aria-label="Bỏ ghim"
        className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/30 text-sm text-white shadow"
      >
        ★
      </span>
    </div>
  );
}
