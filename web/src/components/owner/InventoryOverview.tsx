"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { SearchInput } from "@/components/ui/ListUI";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BackBar, goBackSmart } from "./Shared";

// "🏬 Kho hàng" — inventory-VALUE overview: how much money is sitting in stock (giá trị tồn), per
// product + store totals. OWNER ONLY (valuation = cost-derived). Complements the operational stock
// screens (nhập hàng / sắp hết / lô-hạn); this is the money-in-stock layer. Learnt from a VN POS.
interface Row {
  item_code: string;
  display_name: string;
  image?: string | null;
  unit?: string;
  qty: number;
  qty_text: string;
  stock_value: number;
  value_text: string;
}
interface Resp {
  rows: Row[];
  total_value_text: string;
  total_qty_text: string;
  sku_count: number;
  has_more: boolean;
}

const SORT_OPTIONS = [
  { key: "value_desc", label: "💰 Giá trị tồn: cao → thấp" },
  { key: "value_asc", label: "💰 Giá trị tồn: thấp → cao" },
  { key: "qty_desc", label: "📦 Số lượng: nhiều → ít" },
  { key: "qty_asc", label: "📦 Số lượng: ít → nhiều" },
  { key: "name_asc", label: "🔤 Tên A → Z" },
];
const SORT_LABEL: Record<string, string> = Object.fromEntries(SORT_OPTIONS.map((o) => [o.key, o.label]));
const PAGE = 24;

// Related warehouse utilities surfaced right on the Kho-hàng hub (learnt from a VN POS that bundles
// nhập/xuất/kiểm/tem here) — each links to an existing Cago screen so there's one place for stock work.
const SHORTCUTS = [
  { icon: "📥", label: "Nhập hàng", href: "/pos/receive" },
  { icon: "🏷", label: "In tem", href: "/pos/labels" },
  { icon: "📦", label: "Sắp hết", href: "/pos/low-stock" },
  { icon: "🛒", label: "Gợi ý nhập", href: "/pos/reorder" },
  { icon: "⏰", label: "Lô & hạn", href: "/pos/expiry" },
  { icon: "📜", label: "Lịch sử nhập", href: "/pos/receive-history" },
];

export function InventoryOverview() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [agg, setAgg] = useState({ total_value_text: "", total_qty_text: "", sku_count: 0 });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("value_desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seqRef = useRef(0);

  const fetchPage = (query: string, sortVal: string, start: number) =>
    frappeCall<Resp>("cago.api.stock.inventory_overview", { query, sort: sortVal, start: String(start), limit: String(PAGE) }, { method: "GET" });

  const load = async (query: string, sortVal: string = sort) => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const r = await fetchPage(query, sortVal, 0);
      if (seq !== seqRef.current) return;
      setRows(r.rows || []);
      setAgg({ total_value_text: r.total_value_text, total_qty_text: r.total_qty_text, sku_count: r.sku_count });
      setHasMore(!!r.has_more);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };
  const more = async () => {
    if (loadingMore) return;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const r = await fetchPage(q.trim(), sort, rows.length);
      if (seq !== seqRef.current) return;
      setRows((prev) => [...prev, ...(r.rows || [])]);
      setHasMore(!!r.has_more);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  return (
    <div className=" pb-10">
      <BackBar title="🏬 Kho hàng" onBack={() => goBackSmart(router)} sub={<SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm tên · mã · mã vạch…" />} />

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-500">💰 Giá trị tồn (theo giá vốn)</span>
          <button onClick={() => router.push("/pos/reports")} className="text-sm font-bold text-brand">📊 Báo cáo</button>
        </div>
        <div className="mt-1 text-3xl font-extrabold text-brand">{loading ? "…" : agg.total_value_text}</div>
        <div className="mt-3 flex divide-x divide-slate-100 border-t border-slate-100 pt-3 text-center">
          <div className="flex-1">
            <div className="text-sm text-slate-400">Số mã hàng</div>
            <div className="text-lg font-extrabold text-slate-700">{loading ? "…" : agg.sku_count}</div>
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-400">Tổng số lượng</div>
            <div className="text-lg font-extrabold text-slate-700">{loading ? "…" : agg.total_qty_text}</div>
          </div>
        </div>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        {SHORTCUTS.map((s) => (
          <button
            key={s.href}
            onClick={() => router.push(s.href)}
            className="flex shrink-0 flex-col items-center gap-1 rounded-xl bg-white px-3.5 py-2 shadow-sm active:bg-slate-50"
          >
            <span className="text-2xl leading-none">{s.icon}</span>
            <span className="whitespace-nowrap text-xs font-bold text-slate-600">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="mb-2 mt-3 flex items-center justify-end">
        <button onClick={() => setSortOpen(true)} className="flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600">
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
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">{q.trim() ? "Không tìm thấy sản phẩm." : "Kho chưa có hàng."}</div>
      ) : (
        <>
          <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
            {rows.map((p) => (
              <button
                key={p.item_code}
                onClick={() => router.push(`/pos/products/${encodeURIComponent(p.item_code)}/edit`)}
                className="mb-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <CatThumb image={p.image} name={p.display_name} variant="thumb" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold leading-tight">{p.display_name}</div>
                  <div className="text-xs text-slate-400">{p.item_code}</div>
                  {/^[\d-]/.test(p.value_text) ? (
                    <div className="text-lg font-extrabold text-harvest-dark">{p.value_text}</div>
                  ) : (
                    <div className="text-sm font-bold text-slate-400">⚠ {p.value_text}</div>
                  )}
                </div>
                <div className="shrink-0 text-right text-sm text-slate-500">
                  SL<div className="text-base font-extrabold text-slate-700">{p.qty_text}</div>
                  {p.unit}
                </div>
              </button>
            ))}
          </div>
          {hasMore && (
            <button onClick={more} disabled={loadingMore} className="mt-1 min-h-touch w-full rounded-xl border-2 border-emerald-200 bg-white font-bold text-brand-dark disabled:opacity-50">
              {loadingMore ? "Đang tải thêm…" : "Tải thêm"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
