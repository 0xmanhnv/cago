"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, logout } from "@/lib/api";
import { useSession } from "@/lib/session";
import { BrandHeader } from "@/components/ui/BrandHeader";
import { confirmDialog } from "@/components/ui/dialog";

interface Digest {
  low_stock: number;
  expiring: number;
  debtors: number;
  debt_total_text: string;
  has_tasks: boolean;
}

// Single registry of every owner action. Groups + favorites reference these by key.
const ACTIONS: Record<string, { label: string; color: string; href: string }> = {
  price: { label: "🔎 Tra giá", color: "bg-blue-600", href: "/owner/price" },
  sell: { label: "🛒 Bán hàng", color: "bg-brand", href: "/staff/sell" },
  creditsale: { label: "🧾 Bán chịu (trừ tồn)", color: "bg-red-600", href: "/owner/credit-sale" },
  coupons: { label: "🎟 Mã giảm giá", color: "bg-violet-600", href: "/owner/coupons" },
  qr: { label: "💳 QR thu tiền", color: "bg-violet-600", href: "/owner/settings" },
  new: { label: "➕ Thêm sản phẩm", color: "bg-teal-600", href: "/owner/products/new" },
  edit: { label: "✏️ Sửa sản phẩm", color: "bg-amber-500", href: "/owner/edit" },
  receive: { label: "📥 Nhập hàng", color: "bg-teal-700", href: "/owner/receive" },
  bulk: { label: "⚡ Nhập hàng loạt", color: "bg-teal-700", href: "/owner/bulk" },
  receivehist: { label: "📜 Lịch sử nhập", color: "bg-teal-600", href: "/owner/receive-history" },
  lowstock: { label: "📦 Hàng sắp hết", color: "bg-teal-600", href: "/owner/low-stock" },
  expiry: { label: "⏰ Lô & hạn dùng", color: "bg-orange-600", href: "/owner/expiry" },
  categories: { label: "🔀 Sắp xếp loại hàng", color: "bg-teal-600", href: "/owner/categories" },
  map: { label: "🗺 Sơ đồ cửa hàng", color: "bg-teal-600", href: "/owner/map" },
  recordpay: { label: "💵 Khách trả nợ", color: "bg-brand", href: "/owner/record-payment" },
  recorddebt: { label: "📝 Ghi nợ (chỉ tiền)", color: "bg-red-500", href: "/owner/record-debt" },
  debt: { label: "📒 Công nợ khách", color: "bg-violet-600", href: "/owner/debt" },
  supplier: { label: "🚚 Công nợ NCC", color: "bg-violet-500", href: "/owner/supplier-debt" },
  cashbook: { label: "🧮 Chốt ca / Sổ quỹ", color: "bg-blue-700", href: "/owner/cashbook" },
  reports: { label: "📊 Báo cáo", color: "bg-blue-600", href: "/owner/reports" },
};
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "🛒 Bán hàng & giá", keys: ["price", "sell", "creditsale", "coupons", "qr"] },
  { title: "📦 Hàng hoá & kho", keys: ["new", "edit", "receive", "bulk", "receivehist", "lowstock", "expiry", "categories", "map"] },
  { title: "📒 Công nợ & sổ quỹ", keys: ["recordpay", "recorddebt", "debt", "supplier", "cashbook"] },
  { title: "📊 Báo cáo", keys: ["reports"] },
];

export function OwnerHome() {
  const router = useRouter();
  const { boot } = useSession();
  const posUrl = boot?.pos_url;
  const [digest, setDigest] = useState<Digest | null>(null);
  const [fav, setFav] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false); // collapse the full menu; expand on demand
  const favRef = useRef<string[]>([]);
  const dragFrom = useRef<number | null>(null);
  favRef.current = fav;

  useEffect(() => {
    frappeCall<Digest>("cago.api.reports.daily_digest", {}, { method: "GET" }).then(setDigest).catch(() => {});
    // Favorites are stored per ACCOUNT (follows the owner across devices), not per browser.
    frappeCall<string[]>("cago.api.prefs.get_home_favorites", {}, { method: "GET" })
      .then((saved) => {
        const a = Array.isArray(saved) ? saved.filter((k) => ACTIONS[k]) : [];
        setFav(a);
        if (!a.length) setShowAll(true); // nothing pinned yet → show the full menu so they can pin
      })
      .catch(() => setShowAll(true));
  }, []);

  const persist = (next: string[]) => {
    frappeCall("cago.api.prefs.set_home_favorites", { keys: JSON.stringify(next) }).catch(() => {});
  };
  const saveFav = (next: string[]) => {
    setFav(next);
    persist(next);
  };
  const togglePin = (key: string) => saveFav(fav.includes(key) ? fav.filter((k) => k !== key) : [...fav, key]);

  // Drag-to-reorder favorites (touch + mouse): grab the ⠿ handle, the tile under the finger swaps in.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragFrom.current == null) return;
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-fav]");
      if (!el) return;
      const to = Number(el.getAttribute("data-fav"));
      if (Number.isInteger(to) && to !== dragFrom.current) {
        const a = [...favRef.current];
        const [m] = a.splice(dragFrom.current, 1);
        a.splice(to, 0, m);
        dragFrom.current = to;
        setFav(a);
      }
    };
    const onUp = () => {
      if (dragFrom.current != null) {
        dragFrom.current = null;
        frappeCall("cago.api.prefs.set_home_favorites", { keys: JSON.stringify(favRef.current) }).catch(() => {});
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const doLogout = async () => {
    if (!(await confirmDialog("Đăng xuất khỏi máy này?", { danger: true, confirmLabel: "Đăng xuất" }))) return;
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  };

  // A normal tile with a corner ☆/★ to pin it to "Hay dùng".
  const Tile = ({ k }: { k: string }) => {
    const a = ACTIONS[k];
    const pinned = fav.includes(k);
    return (
      <div className="relative">
        <button onClick={() => router.push(a.href)} className={`mt-tile w-full ${a.color}`}>
          {a.label}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(k); }}
          aria-label={pinned ? "Bỏ ghim" : "Ghim lên Hay dùng"}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-sm text-white"
        >
          {pinned ? "★" : "☆"}
        </button>
      </div>
    );
  };

  return (
    <div>
      <BrandHeader subtitle="Chủ cửa hàng" />

      {digest?.has_tasks && (
        <div className="mb-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="font-extrabold text-amber-800">📌 Việc cần làm hôm nay</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {digest.low_stock > 0 && (
              <button onClick={() => router.push("/owner/low-stock")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-amber-800 shadow">📦 {digest.low_stock} hàng sắp hết</button>
            )}
            {digest.expiring > 0 && (
              <button onClick={() => router.push("/owner/expiry")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-orange-700 shadow">⏰ {digest.expiring} lô sắp hết hạn</button>
            )}
            {digest.debtors > 0 && (
              <button onClick={() => router.push("/owner/debt")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-700 shadow">📒 {digest.debtors} khách nợ · {digest.debt_total_text}</button>
            )}
          </div>
        </div>
      )}

      {/* ⭐ Hay dùng — customizable: pin tiles here, drag the ⠿ handle to reorder. */}
      <div className="mb-1 ml-1 mt-1 text-lg font-extrabold text-brand-dark">⭐ Hay dùng</div>
      {fav.length === 0 ? (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-emerald-200 bg-white/60 p-4 text-center text-slate-500">
          Bấm ☆ trên một mục bên dưới để ghim lên đây cho tiện.
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3.5">
          {fav.map((k, i) => {
            const a = ACTIONS[k];
            if (!a) return null;
            return (
              <div key={k} data-fav={i} className="relative touch-none">
                <button onClick={() => router.push(a.href)} className={`mt-tile w-full pl-9 ${a.color}`}>
                  {a.label}
                </button>
                <span
                  onPointerDown={(e) => { e.preventDefault(); dragFrom.current = i; }}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab select-none px-1 text-xl text-white/80"
                  aria-label="Kéo để sắp xếp"
                >
                  ⠿
                </span>
                <button onClick={(e) => { e.stopPropagation(); togglePin(k); }} aria-label="Bỏ ghim" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-sm text-white">★</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Toggle: keep the page short — favorites stay, the full menu hides behind this. */}
      <button
        onClick={() => setShowAll((v) => !v)}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-white py-3 text-lg font-extrabold text-brand-dark"
      >
        🧰 Tất cả chức năng <span className={`inline-block transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Grouped sections — smooth expand/collapse via grid-rows 0fr↔1fr (no abrupt show/hide). */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${showAll ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="mb-1.5 ml-1 text-base font-bold text-slate-500">{g.title}</div>
              <div className="grid grid-cols-2 gap-3.5">
                {g.keys.map((k) => (
                  <Tile key={k} k={k} />
                ))}
                {g.title.startsWith("🛒") && posUrl && (
                  <a href={posUrl} target="_blank" rel="noopener" className="mt-tile bg-slate-600">🧾 POS Awesome (quầy)</a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <a href="/desk" target="_blank" rel="noopener" className="mt-tile min-h-[64px] bg-slate-500 text-lg">⚙️ Quản lý ERPNext</a>
        <button onClick={doLogout} className="mt-tile min-h-[64px] bg-red-600 text-lg">🚪 Đăng xuất</button>
      </div>
    </div>
  );
}
