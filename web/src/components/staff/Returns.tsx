"use client";

import { uomLabel } from "@/lib/uom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { DateHeader, FilterTabs, groupOrdered, SearchInput } from "@/components/ui/ListUI";
import { BackBar, money } from "@/components/owner/Shared";

import { PageLoading } from "@/components/ui/Loading";
interface RetLine {
  item_code: string;
  name: string;
  uom: string;
  remaining: number;
  rate: number;
  rate_text: string;
}

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

export function Returns() {
  const router = useRouter();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [counts, setCounts] = useState<{ all: number; returnable: number; returned: number }>({ all: 0, returnable: 0, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("returnable");
  const [busy, setBusy] = useState("");
  const [retRow, setRetRow] = useState<SaleRow | null>(null); // invoice being returned (opens the panel)
  const [retLines, setRetLines] = useState<RetLine[]>([]);
  const [retQty, setRetQty] = useState<Record<string, string>>({});
  const [retLoading, setRetLoading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0); // ignore out-of-order list responses (newest tab/query wins)

  // All filtering/counting is SERVER-side so the numbers are true totals, not "loaded so far".
  const load = async (t: Tab, query: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const r = (await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: t, query, start: 0, limit: PAGE }, { method: "GET" })) || [];
      if (seq !== seqRef.current) return;
      setRows(r);
      setHasMore(r.length >= PAGE);
    } catch {
      if (seq !== seqRef.current) return;
      setRows([]);
      setHasMore(false);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };
  const loadMore = async () => {
    if (loadingMore || loading) return;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const r = (await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: tab, query: q.trim(), start: rows.length, limit: PAGE }, { method: "GET" })) || [];
      if (seq !== seqRef.current) return;
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

  // Open the return panel: load each line's remaining returnable qty (defaults to full remaining).
  const openReturn = async (s: SaleRow) => {
    setRetRow(s);
    setRetLines([]);
    setRetQty({});
    setRetLoading(true);
    try {
      const r = await frappeCall<{ lines: RetLine[] }>("cago.api.sales.get_returnable", { invoice: s.invoice }, { method: "GET" });
      setRetLines(r.lines || []);
      const init: Record<string, string> = {};
      (r.lines || []).forEach((l) => (init[l.item_code] = String(l.remaining)));
      setRetQty(init);
    } catch {
      setRetLines([]);
    } finally {
      setRetLoading(false);
    }
  };
  const retParsed = retLines.map((l) => {
    const q = Math.max(0, Math.min(l.remaining, parseFloat((retQty[l.item_code] || "0").replace(",", ".")) || 0));
    return { ...l, q };
  });
  const refundTotal = retParsed.reduce((s, l) => s + l.q * l.rate, 0);
  const confirmReturn = async () => {
    if (!retRow || busy) return;
    const lines = retParsed.filter((l) => l.q > 0).map((l) => ({ item_code: l.item_code, qty: l.q }));
    if (!lines.length) {
      toast.error("Chọn số lượng cần trả (lớn hơn 0).");
      return;
    }
    const inv = retRow.invoice;
    setBusy(inv);
    try {
      const r = await frappeCall<{ return_invoice: string; total_text: string }>("cago.api.sales.return_sale", { invoice: inv, lines: JSON.stringify(lines) });
      toast.success(`Đã trả hàng ${r.total_text}. Hàng đã về kho.`);
      setRetRow(null);
      void loadCounts();
      await load(tab, q.trim());
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không trả được."}`);
    } finally {
      setBusy("");
    }
  };

  const groups = groupOrdered(rows, (s) => s.date_group);

  return (
    <div className="pb-10">
      {/* Đổi hàng = trả + bán mới; lives in the header so it's one "trả/đổi" entry, not two tiles. */}
      <BackBar
        title="↩️ Trả hàng"
        onBack={() => router.push("/pos")}
        right={
          <button onClick={() => router.push("/pos/exchange")} className="shrink-0 whitespace-nowrap rounded-xl bg-white/20 px-3 py-2 font-bold text-white">
            ↔️ Đổi hàng
          </button>
        }
        sub={
          <>
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
          </>
        }
      />

      {loading ? (
        <PageLoading />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">{q.trim() ? "Không tìm thấy hoá đơn." : "Chưa có hoá đơn nào."}</div>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.label}>
              <DateHeader label={g.label} />
              <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
              {g.items.map((s) => (
                <div key={s.invoice} className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{s.customer_name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {s.invoice} · {s.item_count} món · {s.time}
                    </div>
                    <div className="font-bold text-brand">{s.total_text}</div>
                  </div>
                  {s.returned ? (
                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-400">Đã trả</span>
                  ) : (
                    <button onClick={() => openReturn(s)} disabled={!!busy} className="rounded-lg bg-red-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">
                      {busy === s.invoice ? "..." : "↩ Trả hàng"}
                    </button>
                  )}
                </div>
              ))}
              </div>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loadingMore && <div className="py-4 text-center text-slate-400">Đang tải thêm...</div>}
        </>
      )}

      {/* Return panel — shows the invoice + lets staff return part of each line. */}
      {retRow && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => !busy && setRetRow(null)}>
          <div className="no-scrollbar max-h-[88vh] w-full max-w-[480px] animate-sheet-up overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-xl font-extrabold">↩ Trả hàng</div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="font-bold text-slate-800">👤 {retRow.customer_name}</div>
              <div className="text-slate-500">
                {retRow.invoice} · {retRow.date_group} {retRow.time} · {retRow.item_count} món · {retRow.total_text}
              </div>
            </div>
            {retLoading ? (
              <PageLoading />
            ) : retLines.length === 0 ? (
              <div className="py-6 text-center text-slate-400">Đơn này đã trả hết, không còn gì để trả.</div>
            ) : (
              <>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-slate-500">Chọn số lượng trả lại</span>
                  <button
                    onClick={() => { const a: Record<string, string> = {}; retLines.forEach((l) => (a[l.item_code] = String(l.remaining))); setRetQty(a); }}
                    className="text-sm font-bold text-brand"
                  >
                    Trả hết đơn
                  </button>
                </div>
                {retLines.map((l) => {
                  const cur = parseFloat((retQty[l.item_code] || "0").replace(",", ".")) || 0;
                  const set = (v: number) => setRetQty((q) => ({ ...q, [l.item_code]: String(Math.max(0, Math.min(l.remaining, +v.toFixed(2)))) }));
                  return (
                    <div key={l.item_code} className="mt-2 rounded-xl border border-slate-200 p-2.5">
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 font-bold leading-tight">{l.name}</span>
                        <span className="shrink-0 text-sm text-slate-500">{l.rate_text}</span>
                      </div>
                      <div className="text-xs text-slate-400">Còn trả được: {l.remaining} {uomLabel(l.uom)}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button onClick={() => set(cur - 1)} className="h-10 w-10 shrink-0 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                        <input
                          inputMode="decimal"
                          value={retQty[l.item_code] ?? ""}
                          onChange={(e) => setRetQty((q) => ({ ...q, [l.item_code]: e.target.value }))}
                          className="h-10 w-20 shrink-0 rounded-lg border-2 border-emerald-300 text-center text-lg font-extrabold"
                        />
                        <button onClick={() => set(cur + 1)} className="h-10 w-10 shrink-0 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                        <span className="text-slate-500">{uomLabel(l.uom)}</span>
                        <span className="ml-auto font-bold text-brand">{money(Math.max(0, Math.min(l.remaining, cur)) * l.rate)}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2.5">
                  <span className="font-bold text-slate-700">Hoàn lại khách</span>
                  <span className="text-2xl font-extrabold text-red-600">{money(refundTotal)}</span>
                </div>
                <button onClick={confirmReturn} disabled={!!busy || refundTotal <= 0} className="mt-3 min-h-touch w-full rounded-xl bg-red-600 text-lg font-extrabold text-white disabled:opacity-50">
                  {busy ? "Đang trả..." : "↩ Xác nhận trả hàng"}
                </button>
              </>
            )}
            <button onClick={() => !busy && setRetRow(null)} className="mt-2 w-full rounded-xl bg-slate-100 py-2.5 font-bold text-slate-500">
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
