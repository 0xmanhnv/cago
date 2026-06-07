"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { DateHeader, FilterTabs, groupOrdered, SearchInput } from "@/components/ui/ListUI";
import { BackBar, goBackSmart } from "@/components/owner/Shared";
import { PageLoading } from "@/components/ui/Loading";
import { printReceipt } from "@/lib/receipt";

// "🧾 ĐƠN HÀNG" — browse/search past sales invoices with their payment status, grouped by day. A
// reporting/lookup hub (distinct from "Khách đã chọn" /pos/orders, which is remote customer orders).
// Reuses cago.api.sales.list_recent_sales (server-side paginated + filterable). Tap a row to reprint.
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

const KIND: Record<SaleRow["kind"], { label: string; cls: string }> = {
  paid: { label: "Đã thu đủ", cls: "bg-emerald-100 text-emerald-700" },
  credit: { label: "Ghi nợ", cls: "bg-amber-100 text-amber-800" },
  partial: { label: "Còn nợ", cls: "bg-amber-100 text-amber-800" },
};

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "unpaid", label: "Còn nợ" },
  { key: "paid", label: "Đã thu đủ" },
];
const PAGE = 30;

export function OrderHistory() {
  const router = useRouter();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [printing, setPrinting] = useState("");
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Monotonic token: every load() (tab switch / new search) bumps it; a load-more in flight is dropped
  // if the token moved meanwhile, so a slow page never appends rows from the previous tab/query.
  const seqRef = useRef(0);

  const load = async (t: string, query: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const r =
        (await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: t, query, start: 0, limit: PAGE }, { method: "GET" })) || [];
      if (seq !== seqRef.current) return; // a newer load started → this response is stale
      setRows(r);
      setHasMore(r.length === PAGE);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load("all", "");
  }, []);

  const more = async () => {
    if (loadingMore) return;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const r =
        (await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: tab, query: q.trim(), start: rows.length, limit: PAGE }, { method: "GET" })) || [];
      if (seq !== seqRef.current) return; // tab/search changed mid-flight → don't append the old page
      setRows((prev) => [...prev, ...r]);
      setHasMore(r.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  };

  const onTab = (t: string) => {
    setTab(t);
    void load(t, q.trim());
  };
  const onSearch = (val: string) => {
    setQ(val);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => load(tab, val.trim()), 300);
  };

  const reprint = async (s: SaleRow) => {
    if (printing) return;
    setPrinting(s.invoice);
    try {
      await printReceipt(s.invoice);
    } catch {
      toast.error("Không in lại được hoá đơn này.");
    } finally {
      setPrinting("");
    }
  };

  const groups = groupOrdered(rows, (s) => s.date_group);

  return (
    <div className="mx-auto max-w-[820px] pb-10">
      <BackBar title="🧾 Đơn hàng" onBack={() => goBackSmart(router)} />
      <SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm số hoá đơn / tên khách…" />
      <FilterTabs active={tab} onChange={onTab} tabs={TABS} />

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
                  <button
                    key={s.invoice}
                    onClick={() => reprint(s)}
                    className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3.5 text-left shadow-sm active:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold">{s.customer_name || "Khách lẻ"}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                        {s.returned && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-400">Đã trả</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {s.invoice} · {s.item_count} món · {s.time}
                      </div>
                      <div className="text-lg font-extrabold text-brand">{s.total_text}</div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
                      {printing === s.invoice ? "..." : "🖨 In lại"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={more}
              disabled={loadingMore}
              className="mt-2 min-h-touch w-full rounded-xl border-2 border-emerald-200 bg-white font-bold text-brand-dark disabled:opacity-50"
            >
              {loadingMore ? "Đang tải thêm…" : "Tải thêm"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
