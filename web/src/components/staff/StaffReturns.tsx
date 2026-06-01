"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { DateHeader, FilterTabs, groupOrdered, SearchInput } from "@/components/ui/ListUI";

interface SaleRow {
  invoice: string;
  customer_name: string;
  total_text: string;
  date_group: string;
  time: string;
  item_count: number;
  returned: boolean;
  kind: "paid" | "credit" | "partial";
}
type Tab = "returnable" | "returned" | "all";
const PAGE = 60;

const KIND = {
  paid: { label: "Tiền", cls: "bg-emerald-100 text-emerald-700" },
  credit: { label: "Nợ", cls: "bg-red-100 text-red-700" },
  partial: { label: "Trả thiếu", cls: "bg-amber-100 text-amber-800" },
} as const;

export function StaffReturns() {
  const router = useRouter();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [counts, setCounts] = useState<{ all: number; returnable: number; returned: number }>({ all: 0, returnable: 0, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("returnable");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // All filtering/counting is SERVER-side so the numbers are true totals, not "loaded so far".
  const load = async (t: Tab, query: string) => {
    setLoading(true);
    try {
      const r = (await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: t, query, start: 0, limit: PAGE }, { method: "GET" })) || [];
      setRows(r);
      setHasMore(r.length >= PAGE);
    } catch {
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };
  const loadMore = async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const r = (await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: tab, query: q.trim(), start: rows.length, limit: PAGE }, { method: "GET" })) || [];
      setRows((prev) => [...prev, ...r]);
      setHasMore(r.length >= PAGE);
    } finally {
      setLoadingMore(false);
    }
  };
  const loadCounts = async () => {
    try {
      setCounts(await frappeCall("cago.api.sales.recent_sales_counts", {}, { method: "GET" }));
    } catch {
      /* keep */
    }
  };
  useEffect(() => {
    void loadCounts();
    void load("returnable", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, rows.length, tab, q]);

  const onTab = (t: Tab) => {
    setTab(t);
    void load(t, q.trim());
  };
  const onSearch = (val: string) => {
    setQ(val);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => load(tab, val.trim()), 300);
  };

  const doReturn = async (inv: string) => {
    if (busy) return;
    if (!(await confirmDialog(`Trả lại toàn bộ hoá đơn ${inv}? Hàng về kho, hoàn tiền khách.`, { danger: true, confirmLabel: "Trả hàng" }))) return;
    setBusy(inv);
    setMsg(null);
    try {
      const r = await frappeCall<{ return_invoice: string; total_text: string }>("cago.api.sales.return_sale", { invoice: inv });
      setMsg(<div className="mb-2.5 rounded-lg bg-emerald-100 p-3 font-bold text-emerald-800">✅ Đã trả hàng {r.total_text}. Hàng đã về kho.</div>);
      void loadCounts();
      await load(tab, q.trim());
    } catch (e) {
      setMsg(<div className="mb-2.5 rounded-lg bg-red-100 p-3 font-bold text-red-700">Lỗi: {e instanceof Error ? e.message : "không trả được."}</div>);
    } finally {
      setBusy("");
    }
  };

  const groups = groupOrdered(rows, (s) => s.date_group);

  return (
    <div className="pb-10">
      <div className="mb-3 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">TRẢ HÀNG</div>
      </div>
      {msg}

      <SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm theo số hoá đơn / tên khách..." />
      <FilterTabs
        active={tab}
        onChange={(k) => onTab(k as Tab)}
        tabs={[
          { key: "returnable", label: "Còn trả được", count: counts.returnable },
          { key: "returned", label: "Đã trả", count: counts.returned },
          { key: "all", label: "Tất cả", count: counts.all },
        ]}
      />

      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">{q.trim() ? "Không tìm thấy hoá đơn." : "Chưa có hoá đơn nào."}</div>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.label}>
              <DateHeader label={g.label} />
              {g.items.map((s) => (
                <div key={s.invoice} className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{s.customer_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {s.invoice} · {s.item_count} món · {s.time}
                    </div>
                    <div className="font-bold text-brand">{s.total_text}</div>
                  </div>
                  {s.returned ? (
                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-400">Đã trả</span>
                  ) : (
                    <button onClick={() => doReturn(s.invoice)} disabled={!!busy} className="rounded-lg bg-red-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">
                      {busy === s.invoice ? "..." : "↩ Trả hàng"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loadingMore && <div className="py-4 text-center text-slate-400">Đang tải thêm...</div>}
        </>
      )}
    </div>
  );
}
