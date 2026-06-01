"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
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

const KIND = {
  paid: { label: "Tiền", cls: "bg-emerald-100 text-emerald-700" },
  credit: { label: "Nợ", cls: "bg-red-100 text-red-700" },
  partial: { label: "Trả thiếu", cls: "bg-amber-100 text-amber-800" },
} as const;

export function StaffReturns() {
  const router = useRouter();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(60);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"returnable" | "returned" | "all">("returnable");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const load = async (lim = limit) => {
    setLoading(true);
    try {
      setRows((await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { limit: lim }, { method: "GET" })) || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doReturn = async (inv: string) => {
    if (busy) return;
    if (!confirm(`Trả lại toàn bộ hoá đơn ${inv}? Hàng về kho, hoàn tiền khách.`)) return;
    setBusy(inv);
    setMsg(null);
    try {
      const r = await frappeCall<{ return_invoice: string; total_text: string }>("cago.api.sales.return_sale", { invoice: inv });
      setMsg(<div className="mb-2.5 rounded-lg bg-emerald-100 p-3 font-bold text-emerald-800">✅ Đã trả hàng {r.total_text}. Hàng đã về kho.</div>);
      await load();
    } catch (e) {
      setMsg(<div className="mb-2.5 rounded-lg bg-red-100 p-3 font-bold text-red-700">Lỗi: {e instanceof Error ? e.message : "không trả được."}</div>);
    } finally {
      setBusy("");
    }
  };

  const text = q.trim().toLowerCase();
  const filtered = rows.filter((s) => {
    if (tab === "returnable" && s.returned) return false;
    if (tab === "returned" && !s.returned) return false;
    if (text && !(`${s.invoice} ${s.customer_name}`.toLowerCase().includes(text))) return false;
    return true;
  });
  const groups = groupOrdered(filtered, (s) => s.date_group);

  return (
    <div className="pb-10">
      <div className="mb-3 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">TRẢ HÀNG</div>
      </div>
      {msg}

      <SearchInput value={q} onChange={setQ} placeholder="🔎 Tìm theo số hoá đơn / tên khách..." />
      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
        tabs={[
          { key: "returnable", label: "Còn trả được", count: rows.filter((s) => !s.returned).length },
          { key: "returned", label: "Đã trả", count: rows.filter((s) => s.returned).length },
          { key: "all", label: "Tất cả", count: rows.length },
        ]}
      />

      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">{text ? "Không tìm thấy hoá đơn." : "Chưa có hoá đơn nào."}</div>
      ) : (
        groups.map((g) => (
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
        ))
      )}

      {!loading && rows.length >= limit && (
        <button
          onClick={() => {
            const n = limit + 100;
            setLimit(n);
            void load(n);
          }}
          className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white py-3 font-bold text-slate-600"
        >
          Xem thêm
        </button>
      )}
    </div>
  );
}
