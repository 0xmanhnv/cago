"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";

interface SaleRow {
  invoice: string;
  customer_name: string;
  total_text: string;
  when: string;
  item_count: number;
  returned: boolean;
  paid: string;
}

export function StaffReturns() {
  const router = useRouter();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", {}, { method: "GET" }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const doReturn = async (inv: string) => {
    if (busy) return;
    if (!confirm(`Trả lại toàn bộ hoá đơn ${inv}? Hàng về kho, hoàn tiền khách.`)) return;
    setBusy(inv);
    setMsg(null);
    try {
      const r = await frappeCall<{ return_invoice: string; total_text: string }>("cago.api.sales.return_sale", { invoice: inv });
      setMsg(<div className="rounded-lg bg-emerald-100 p-3 font-bold text-emerald-800">✅ Đã trả hàng {r.total_text}. Hàng đã về kho.</div>);
      await load();
    } catch (e) {
      setMsg(<div className="rounded-lg bg-red-100 p-3 font-bold text-red-700">Lỗi: {e instanceof Error ? e.message : "không trả được."}</div>);
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">TRẢ HÀNG</div>
      </div>
      {msg}
      <p className="mb-2 text-slate-500">Chọn hoá đơn khách muốn trả. Hệ thống hoàn hàng về kho và hoàn tiền.</p>
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Chưa có hoá đơn nào.</div>
      ) : (
        rows.map((s) => (
          <div key={s.invoice} className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{s.customer_name}</div>
              <div className="text-sm text-slate-500">
                {s.invoice} · {s.item_count} món · {s.when} · {s.paid}
              </div>
              <div className="font-bold text-brand">{s.total_text}</div>
            </div>
            {s.returned ? (
              <span className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-bold text-slate-500">Đã trả</span>
            ) : (
              <button
                onClick={() => doReturn(s.invoice)}
                disabled={!!busy}
                className="rounded-lg bg-red-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"
              >
                {busy === s.invoice ? "..." : "↩ Trả hàng"}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
