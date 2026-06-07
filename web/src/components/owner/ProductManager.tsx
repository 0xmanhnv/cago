"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { SearchInput } from "@/components/ui/ListUI";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { ProductCard } from "@/lib/types";
import { BackBar, goBackSmart, StockBadge } from "./Shared";
import { SectionTabs } from "@/components/pos/SectionTabs";

// One product hub: search to look up a price (tra giá) → tap to edit (sửa), ➕ to add (thêm) —
// the three old separate screens. Related product tools live here as quick links instead of
// scattered home tiles.

// Sort options offered by the "↓↑ Sắp xếp" sheet. Keys match cago.api.owner.search_products(sort=).
// Price sorts are resolved server-side over ALL matches (price lives in a separate Item Price query).
const SORT_OPTIONS = [
  { key: "default", label: "Mặc định" },
  { key: "newest", label: "🆕 Mới nhất" },
  { key: "price_asc", label: "💲 Giá thấp → cao" },
  { key: "price_desc", label: "💲 Giá cao → thấp" },
  { key: "name_asc", label: "🔤 Tên A → Z" },
  { key: "name_desc", label: "🔤 Tên Z → A" },
];
const SORT_LABEL: Record<string, string> = Object.fromEntries(SORT_OPTIONS.map((o) => [o.key, o.label]));

export function ProductManager() {
  const router = useRouter();
  // Optional ?q= seed — e.g. "Trợ lý học gì" → "Bổ sung dữ liệu" deep-links here prefilled with the
  // unanswered question so the owner immediately sees matching products to edit (add nickname / label)
  // or finds none → "➕ Thêm sản phẩm mới".
  const seed = useSearchParams().get("q") || "";
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(seed);
  const [sort, setSort] = useState<string>("default");
  const [sortOpen, setSortOpen] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = async (query: string, sortVal: string = sort) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { query };
      if (sortVal && sortVal !== "default") params.sort = sortVal;
      setList((await frappeCall<ProductCard[]>("cago.api.owner.search_products", params, { method: "GET" })) || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(seed.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => load(v.trim()), 300);
  };
  const chooseSort = (s: string) => {
    setSort(s);
    setSortOpen(false);
    void load(q.trim(), s);
  };
  const edit = (code: string) => router.push(`/pos/products/${encodeURIComponent(code)}/edit`);

  return (
    <div className="mx-auto max-w-[820px]">
      <BackBar onBack={() => goBackSmart(router)} title="📦 SẢN PHẨM" />
      <SectionTabs group="products" />
      <button onClick={() => router.push("/pos/products/new")} className="mt-tile mb-3 min-h-[60px] w-full bg-teal-600 text-lg">
        ➕ Thêm sản phẩm mới
      </button>
      <SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm tên · mã · biệt danh…" />
      <div className="mb-3 mt-2 flex items-center justify-between">
        <span className="text-sm text-slate-400">{loading ? "" : `${list.length} sản phẩm`}</span>
        <button
          onClick={() => setSortOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600"
        >
          ↓↑ {SORT_LABEL[sort]}
        </button>
      </div>
      {sortOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setSortOpen(false)}>
          <div className="w-full rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-center text-lg font-extrabold text-brand-dark">Sắp xếp</div>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => chooseSort(o.key)}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-lg ${sort === o.key ? "bg-emerald-50 font-extrabold text-brand" : "text-slate-700"}`}
              >
                {o.label}
                {sort === o.key && <span>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <SkeletonRows rows={6} />
      ) : list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy sản phẩm.</div>
      ) : (
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
          {list.map((p) => (
            <button key={p.item_code} onClick={() => edit(p.item_code)} className="mb-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-tight">{p.recommended && <span title="Khuyên dùng">⭐ </span>}{p.display_name}</div>
                <div className="text-lg font-extrabold text-brand">{p.price_text}</div>
                <StockBadge status={p.stock_status} />
              </div>
              <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white">Sửa →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
