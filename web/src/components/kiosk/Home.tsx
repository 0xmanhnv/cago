"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { useSession } from "@/lib/session";
import { catColor, catIcon } from "@/lib/kioskUi";
import type { Category } from "@/lib/types";

export function Home() {
  const nav = useKioskNav();
  const kiosk = useKiosk();
  const { boot } = useSession();
  const brand = boot?.brand || "Minh Tuyết";
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    kiosk.clearFocus();
    frappeCall<Category[]>("cago.api.kiosk.get_categories", {}, { method: "GET" })
      .then((d) => setCategories(d || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Brand banner — green field + golden-harvest accent */}
      <div className="animate-rise-in relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark px-6 py-6 text-center text-white shadow-card">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-harvest via-amber-300 to-harvest" />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-harvest/20 text-4xl leading-none ring-2 ring-harvest/60">
          🌾
        </div>
        <div className="mt-2 text-3xl font-extrabold tracking-tight">{brand}</div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">Vật tư nông nghiệp</div>
        <div className="mt-2 inline-block rounded-full bg-harvest/25 px-3 py-1 text-sm font-bold text-amber-50">
          🌾 Đồng hành cùng nhà nông
        </div>
        <div className="mt-3 text-lg font-bold text-emerald-50">Bác cần mua gì hôm nay?</div>
      </div>

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

      <SectionTitle>🧺 Chọn loại hàng</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        {categories.map((c, i) => (
          <CategoryCard
            key={c.category}
            onClick={() => nav.openList(c.category)}
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
          delay={120 + categories.length * 50}
        />
      </div>

      <SectionTitle className="mt-7">💬 Cần giúp đỡ?</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <HelpCard onClick={nav.openChat} icon="🤖" title="Hỏi trợ lý" from="from-violet-500" to="to-violet-700" />
        <HelpCard onClick={kiosk.openCallStaff} icon="🔔" title="Gọi người bán" from="from-rose-500" to="to-red-600" />
        {boot?.kiosk_debt_visible && (
          <HelpCard onClick={nav.openMyDebt} icon="📒" title="Công nợ của tôi" from="from-amber-400" to="to-harvest-dark" />
        )}
      </div>
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
}: {
  onClick: () => void;
  color: string;
  icon: string;
  title: string;
  sub: string;
  delay: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{ background: `linear-gradient(160deg, ${color} 0%, #ffffff 130%)`, animationDelay: `${delay}ms` }}
      className="animate-rise-in flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border border-white/60 p-4 text-center shadow-soft transition hover:-translate-y-0.5 hover:shadow-card active:scale-[0.97]"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/80 text-4xl shadow-sm">{icon}</span>
      <span className="text-xl font-extrabold text-brand-dark">{title}</span>
      <span className="rounded-full bg-white/70 px-3 py-0.5 text-sm font-bold text-brand-dark/70">{sub}</span>
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
