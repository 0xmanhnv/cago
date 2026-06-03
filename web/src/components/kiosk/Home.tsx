"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav, resetKioskDepth } from "@/lib/kioskNav";
import { useSession } from "@/lib/session";
import { catColor, catIcon } from "@/lib/kioskUi";
import { CatThumb } from "./CatThumb";
import type { Category, ProductCard } from "@/lib/types";

export function Home() {
  const nav = useKioskNav();
  const kiosk = useKiosk();
  const { boot } = useSession();
  const brand = boot?.brand || "Minh Tuyết";
  const [categories, setCategories] = useState<Category[]>([]);
  const [best, setBest] = useState<ProductCard[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    resetKioskDepth(); // back at home → reset nav depth (heals any drift from gesture-back)
    kiosk.clearFocus();
    frappeCall<Category[]>("cago.api.kiosk.get_categories", {}, { method: "GET" })
      .then((d) => setCategories(d || []))
      .catch(() => {});
    frappeCall<ProductCard[]>("cago.api.kiosk.best_sellers", { limit: 8 }, { method: "GET" })
      .then((d) => setBest(d || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Brand banner — compact: logo + name on one row, slogan beneath; keeps the fold for products */}
      <div className="animate-rise-in relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark px-5 py-4 text-white shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-harvest via-amber-300 to-harvest" />
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-harvest/20 text-2xl leading-none ring-2 ring-harvest/60">
            🌾
          </span>
          <div className="min-w-0">
            <div className="text-2xl font-extrabold leading-tight tracking-tight">{brand}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">Vật tư nông nghiệp</div>
          </div>
          <span className="ml-auto hidden rounded-full bg-harvest/25 px-3 py-1 text-sm font-bold text-amber-50 sm:inline">
            🌾 Đồng hành cùng nhà nông
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 sm:hidden">
          <span className="rounded-full bg-harvest/25 px-2.5 py-0.5 text-xs font-bold text-amber-50">🌾 Đồng hành cùng nhà nông</span>
        </div>
      </div>
      <div className="mb-3 ml-1 text-lg font-bold text-brand-dark">Bác cần mua gì hôm nay?</div>

      {/* Search */}
      <div className="animate-rise-in relative mb-6" style={{ animationDelay: "60ms" }}>
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl">🔎</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && nav.openList("", search.trim())}
          placeholder="Tìm sản phẩm..."
          className="w-full rounded-2xl border-2 border-emerald-200 bg-white py-4 pr-4 text-lg shadow-soft outline-none transition focus:border-brand"
          style={{ paddingLeft: "3.25rem" }}
        />
      </div>

      {/* 🏆 Bán chạy — top-selling products so customers see what's popular. Hidden when no sales yet. */}
      {best.length > 0 && (
        <>
          <SectionTitle>🏆 Bán chạy</SectionTitle>
          <div className="no-scrollbar -mx-1 mb-6 flex gap-3 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible xl:grid-cols-5">
            {best.map((p) => (
              <button
                key={p.item_code}
                onClick={() => nav.openDetail(p.item_code)}
                className="flex w-[150px] flex-none flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-card lg:w-auto"
              >
                <div className="relative">
                  <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="grid" />
                  <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white shadow">🏆 Bán chạy</span>
                </div>
                <div className="flex flex-1 flex-col p-2.5">
                  <div className="line-clamp-2 min-h-[2.5em] text-sm font-bold leading-tight">{p.display_name}</div>
                  <div className="mt-auto pt-1 font-extrabold text-brand">{p.price_text}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>🧺 Chọn loại hàng</SectionTitle>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {categories.map((c, i) => (
          <CategoryCard
            key={c.slug}
            onClick={() => nav.openList(c.slug)}
            color={catColor(c.color)}
            icon={catIcon(c.icon)}
            title={c.category}
            sub={`${c.count} loại`}
            delay={120 + i * 50}
          />
        ))}
        <CategoryCard
          onClick={() => nav.openList("")}
          color="#e2e8f0"
          icon="🛒"
          title="Xem tất cả"
          sub="toàn bộ sản phẩm"
          // Grid auto-places the last tile across breakpoints (2→5 cols), so keep it a normal card.
          wide={false}
          delay={120 + categories.length * 50}
        />
      </div>

      <SectionTitle className="mt-7">💬 Cần giúp đỡ?</SectionTitle>
      {(() => {
        // Only the cards that actually apply (store map + debt are optional).
        const cards = [
          <HelpCard key="chat" onClick={nav.openChat} icon="🤖" title="Hỏi trợ lý" from="from-violet-500" to="to-violet-700" />,
          <HelpCard key="staff" onClick={kiosk.openCallStaff} icon="🔔" title="Gọi người bán" from="from-rose-500" to="to-red-600" />,
          <HelpCard key="help" onClick={nav.openHelp} icon="❓" title="Hướng dẫn" from="from-sky-500" to="to-blue-700" />,
          boot?.store_map ? <HelpCard key="map" onClick={nav.openMap} icon="🗺" title="Sơ đồ cửa hàng" from="from-teal-500" to="to-emerald-700" /> : null,
          boot?.kiosk_debt_visible ? <HelpCard key="debt" onClick={nav.openMyDebt} icon="📒" title="Công nợ của tôi" from="from-amber-400" to="to-harvest-dark" /> : null,
        ].filter(Boolean);
        // Strategy: fill ONE row when ≤3 (cols = count, so no lonely leftover); 4 → a tidy 2×2;
        // ≥5 → rows of 3. Keeps cards balanced whatever the optional ones add up to.
        const n = cards.length;
        const cols = n <= 1 ? "grid-cols-1" : n === 2 || n === 4 ? "grid-cols-2" : "grid-cols-3";
        return <div className={`grid ${cols} gap-4`}>{cards}</div>;
      })()}
    </div>
  );
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-2.5 ml-1 text-lg font-extrabold text-brand-dark ${className}`}>{children}</div>;
}

function CategoryCard({
  onClick,
  color,
  icon,
  title,
  sub,
  delay,
  wide = false,
}: {
  onClick: () => void;
  color: string;
  icon: string;
  title: string;
  sub: string;
  delay: number;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{ background: `linear-gradient(160deg, ${color} 0%, #ffffff 130%)`, animationDelay: `${delay}ms` }}
      className={`animate-rise-in rounded-3xl border border-white/60 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card active:scale-[0.97] ${
        wide
          ? "col-span-2 flex min-h-[96px] flex-row items-center justify-center gap-4 p-4"
          : "flex min-h-[140px] flex-col items-center justify-center gap-2 p-4 text-center"
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm ${wide ? "h-14 w-14 text-3xl" : "h-16 w-16 text-4xl"}`}>
        {icon}
      </span>
      {wide ? (
        <span className="flex flex-col items-start leading-tight">
          <span className="text-xl font-extrabold text-brand-dark">{title}</span>
          <span className="text-sm font-bold text-brand-dark/70">{sub}</span>
        </span>
      ) : (
        <>
          <span className="text-xl font-extrabold text-brand-dark">{title}</span>
          <span className="rounded-full bg-white/70 px-3 py-0.5 text-sm font-bold text-brand-dark/70">{sub}</span>
        </>
      )}
    </button>
  );
}

function HelpCard({
  onClick,
  icon,
  title,
  from,
  to,
}: {
  onClick: () => void;
  icon: string;
  title: string;
  from: string;
  to: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`animate-rise-in flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-3xl bg-gradient-to-br ${from} ${to} p-4 text-white shadow-card transition hover:-translate-y-0.5 active:scale-[0.97]`}
    >
      <span className="text-4xl leading-none">{icon}</span>
      <span className="text-xl font-extrabold">{title}</span>
    </button>
  );
}
