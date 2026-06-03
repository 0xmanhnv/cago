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
// groups/favorites reference these by key. Hrefs all live under the unified /pos app.
const ACTIONS: Record<string, { label: string; color: string; href: string; cap: Need }> = {
  sell: { label: "🛒 Bán hàng", color: "bg-brand", href: "/pos/sell", cap: "sell" },
  search: { label: "🔎 Tra sản phẩm", color: "bg-blue-600", href: "/pos/search", cap: null },
  returns: { label: "↩️ Trả hàng", color: "bg-rose-600", href: "/pos/returns", cap: "returns" },
  exchange: { label: "🔁 Đổi hàng", color: "bg-rose-500", href: "/pos/exchange", cap: "returns" },
  orders: { label: "📋 Khách đã chọn", color: "bg-teal-600", href: "/pos/orders", cap: null },
  assistant: { label: "🤖 Hỏi trợ lý", color: "bg-violet-600", href: "/pos/assistant", cap: null },
  creditsale: { label: "🧾 Bán chịu (trừ tồn)", color: "bg-red-600", href: "/pos/credit-sale", cap: "sell" },
  coupons: { label: "🎟 Mã giảm giá", color: "bg-violet-600", href: "/pos/coupons", cap: "settings" },
  qr: { label: "💳 QR thu tiền", color: "bg-violet-600", href: "/pos/settings", cap: "settings" },
  price: { label: "🔎 Tra giá / sửa giá", color: "bg-blue-600", href: "/pos/price", cap: "products" },
  new: { label: "➕ Thêm sản phẩm", color: "bg-teal-600", href: "/pos/products/new", cap: "products" },
  edit: { label: "✏️ Sửa sản phẩm", color: "bg-amber-500", href: "/pos/edit", cap: "products" },
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
  aisettings: { label: "🤖 Cấu hình trợ lý AI", color: "bg-slate-600", href: "/pos/ai-settings", cap: "owner" },
  staffadmin: { label: "👥 Nhân viên & quyền", color: "bg-slate-600", href: "/pos/staff", cap: "owner" },
};
// A pinned home tile: which action + how wide (1 = half, 2 = full row on the 2-col grid).
type Fav = { k: string; w: 1 | 2 };

const FAV_CACHE = "cago_fav_cache";
// Hydrate from the local cache BEFORE the browser paints (layout effect), so the "⭐ Hay dùng" tiles
// appear in the very first frame instead of fetching from the server and popping in (layout shift /
// jank). Server stays the source of truth — the mount effect revalidates + rewrites the cache.
// Isomorphic: useEffect on the server (no-op) avoids the SSR "useLayoutEffect" warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "🛒 Bán hàng", keys: ["sell", "search", "returns", "exchange", "orders", "assistant", "creditsale", "coupons", "qr"] },
  { title: "📦 Hàng hoá & kho", keys: ["alerts", "price", "new", "edit", "labels", "receive", "bulk", "receivehist", "lowstock", "reorder", "expiry", "categories", "map"] },
  { title: "📒 Công nợ & sổ quỹ", keys: ["recordpay", "recorddebt", "debt", "verify", "supplier", "cashbook"] },
  { title: "📊 Báo cáo & quản lý", keys: ["reports", "unsafe", "aisettings", "staffadmin"] },
];

export function PosHome() {
  const router = useRouter();
  const { boot } = useSession();
  const posUrl = boot?.pos_url;
  const owner = isOwner(boot);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [onboard, setOnboard] = useState<Onboarding | null>(null);
  const [onboardHidden, setOnboardHidden] = useState(true);
  const [fav, setFav] = useState<Fav[]>([]);
  const [favLoaded, setFavLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const editRef = useRef(false);
  const lp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const justLong = useRef(false);
  editRef.current = editMode;

  // Whether THIS user may use an action (owner sees all; null = any internal).
  const can = (k: string) => {
    const a = ACTIONS[k];
    if (!a) return false;
    if (a.cap === null) return isInternal(boot);
    if (a.cap === "owner") return owner;
    return hasCap(boot, a.cap);
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
    router.push(ACTIONS[k].href);
  };
  useEffect(() => () => clearTimeout(lp.current), []);

  // Paint the cached favorites immediately (pre-paint) → no pop-in on entering/returning home.
  useIsoLayoutEffect(() => {
    try {
      const raw = window.localStorage?.getItem(FAV_CACHE);
      if (raw) {
        const a = JSON.parse(raw) as Fav[];
        if (Array.isArray(a)) { setFav(a.filter((f) => f && ACTIONS[f.k])); setFavLoaded(true); }
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
    frappeCall<Digest>("cago.api.reports.daily_digest", {}, { method: "GET" }).then(setDigest).catch(() => {});
    // Saved favorites: new format = [{k,w}]; legacy = ["key", ...] (treated as width 1).
    frappeCall<(string | Fav)[]>("cago.api.prefs.get_home_favorites", {}, { method: "GET" })
      .then((saved) => {
        const a: Fav[] = Array.isArray(saved)
          ? saved
              .map((it): Fav => (typeof it === "string" ? { k: it, w: 1 } : { k: it.k, w: it.w === 2 ? 2 : 1 }))
              .filter((f) => ACTIONS[f.k])
          : [];
        setFav(a);
        if (!a.length) setShowAll(true);
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

      {digest?.has_tasks && (
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
                onClick={() => router.push(a.href)}
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
          onClick={() => setShowAll((v) => !v)}
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
            const hasPos = g.title.startsWith("🛒") && !!posUrl && hasCap(boot, "sell");
            if (!keys.length && !hasPos) return null; // hide an empty group entirely
            const total = keys.length + (hasPos ? 1 : 0);
            const lastOdd = total % 2 === 1;
            return (
              <div key={g.title} className="mb-3">
                <div className="mb-1.5 ml-1 text-base font-bold text-slate-500">{g.title}</div>
                <div className="grid grid-cols-2 gap-3.5">
                  {keys.map((k, idx) => (
                    <Tile key={k} k={k} wide={lastOdd && !hasPos && idx === keys.length - 1} />
                  ))}
                  {hasPos && (
                    <a href={posUrl} target="_blank" rel="noopener" className={`mt-tile bg-slate-600 ${lastOdd ? "col-span-2" : ""}`}>🧾 POS Awesome (quầy)</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        {owner && (
          <a href="/app" target="_blank" rel="noopener" className="mt-tile min-h-[64px] bg-slate-500 text-lg">⚙️ Quản lý ERPNext</a>
        )}
        <button onClick={doLogout} className={`mt-tile min-h-[64px] bg-red-600 text-lg ${owner ? "" : "col-span-2"}`}>🚪 Đăng xuất</button>
      </div>
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
