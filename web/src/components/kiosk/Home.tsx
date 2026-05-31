"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { catColor, catIcon } from "@/lib/kioskUi";
import type { Category } from "@/lib/types";

export function Home() {
  const nav = useKioskNav();
  const kiosk = useKiosk();
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
      <div className="my-5 text-center text-3xl font-extrabold text-brand-dark">BÁC CẦN MUA GÌ?</div>
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && nav.openList("", search.trim())}
          placeholder="Tìm sản phẩm..."
          className="w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
        />
      </div>

      <div className="mx-1 mb-2 text-base font-extrabold text-brand-dark">🧺 Chọn loại hàng</div>
      <div className="grid grid-cols-2 gap-4">
        {categories.map((c) => (
          <button
            key={c.category}
            onClick={() => nav.openList(c.category)}
            className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl p-3 text-xl font-extrabold text-brand-dark"
            style={{ background: catColor(c.color) }}
          >
            <span className="text-5xl leading-none">{catIcon(c.icon)}</span>
            <span>{c.category}</span>
            <span className="text-sm font-semibold opacity-80">{c.count} loại</span>
          </button>
        ))}
        <button
          onClick={() => nav.openList("")}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl bg-slate-500 p-3 text-xl font-extrabold text-white"
        >
          <span className="text-5xl leading-none">🛒</span>
          <span>Xem tất cả</span>
        </button>
      </div>

      <div className="mx-1 mb-2 mt-5 text-base font-extrabold text-brand-dark">💬 Cần giúp đỡ?</div>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={nav.openChat}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl bg-violet-600 p-3 text-xl font-extrabold text-white"
        >
          <span className="text-5xl leading-none">🤖</span>
          <span>Hỏi trợ lý</span>
        </button>
        <button
          onClick={kiosk.openCallStaff}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl bg-red-600 p-3 text-xl font-extrabold text-white"
        >
          <span className="text-5xl leading-none">🔔</span>
          <span>Gọi người bán</span>
        </button>
      </div>
    </div>
  );
}
