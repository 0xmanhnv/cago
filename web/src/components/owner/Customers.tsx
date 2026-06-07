"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { SearchInput } from "@/components/ui/ListUI";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BackBar, goBackSmart, money } from "./Shared";

interface Row {
  customer: string;
  slug: string;
  customer_name: string;
  nickname: string;
  mobile: string;
  village: string;
  outstanding: number;
}

// Two-letter avatar from the last words of the name ("Cô Ba Test" → "BT").
export const initials = (name: string) =>
  (name || "").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

// "👥 Khách hàng" — the customer directory (separate from "📒 Công nợ khách hàng" which lists only
// debtors). Search → tap a customer to open their profile (info + stats + recent orders).
export function Customers() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seqRef = useRef(0);

  const load = async (query: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const r = await frappeCall<{ rows: Row[]; has_more: boolean }>("cago.api.customers.list_customers", { query, start: 0, limit: 30 }, { method: "GET" });
      if (seq !== seqRef.current) return;
      setRows(r.rows || []);
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
      const r = await frappeCall<{ rows: Row[]; has_more: boolean }>("cago.api.customers.list_customers", { query: q.trim(), start: rows.length, limit: 30 }, { method: "GET" });
      if (seq !== seqRef.current) return;
      setRows((prev) => [...prev, ...(r.rows || [])]);
      setHasMore(!!r.has_more);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    void load("");
  }, []);
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => load(v.trim()), 300);
  };

  return (
    <div className="mx-auto max-w-[820px]">
      <BackBar onBack={() => goBackSmart(router)} title="👥 Khách hàng" sub={<SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm tên · tên gọi · SĐT · xóm…" />} />
      <button onClick={() => router.push("/pos/customers/new")} className="mt-add mb-3">
        ➕ Thêm khách mới
      </button>
      {loading ? (
        <SkeletonRows rows={6} thumb={false} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">{q.trim() ? "Không tìm thấy khách." : "Chưa có khách nào."}</div>
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-x-3">
          {rows.map((r) => (
            <button
              key={r.customer}
              onClick={() => router.push(`/pos/customers/${encodeURIComponent(r.slug)}`)}
              className="mb-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-extrabold text-brand">{initials(r.customer_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {r.customer_name}
                  {r.nickname ? <span className="font-normal text-slate-400"> · {r.nickname}</span> : null}
                </span>
                <span className="block truncate text-sm text-slate-500">
                  {r.mobile || "—"}
                  {r.village ? ` · ${r.village}` : ""}
                </span>
              </span>
              {r.outstanding > 0 ? <span className="shrink-0 text-sm font-bold text-red-600">{money(r.outstanding)}</span> : <span className="shrink-0 text-xs text-slate-300">Không nợ</span>}
            </button>
          ))}
        </div>
      )}
      {!loading && hasMore && (
        <button onClick={more} disabled={loadingMore} className="mt-1 min-h-touch w-full rounded-xl border-2 border-emerald-200 bg-white font-bold text-brand-dark disabled:opacity-50">
          {loadingMore ? "Đang tải…" : "Tải thêm"}
        </button>
      )}
    </div>
  );
}
