"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";

interface CustomerLite {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  outstanding_text: string;
}

const fmtAmt = (s: string) => {
  const d = (s || "").replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("vi-VN") : "";
};
const parseAmt = (t: string) => parseInt((t || "").replace(/[^\d]/g, ""), 10) || 0;

export function StaffRecordPayment() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [list, setList] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<CustomerLite | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const r = (await frappeCall<CustomerLite[]>("cago.api.sales.search_customers_lite", { query, start: 0 }, { method: "GET" })) || [];
      setList(r);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  const submit = async () => {
    if (!picked || busy) return;
    const amt = parseAmt(amount);
    if (amt <= 0) {
      await alertDialog("Nhập số tiền khách trả.", { danger: true });
      return;
    }
    if (!(await confirmDialog(`Xác nhận: ${picked.customer_name} trả ${amt.toLocaleString("vi-VN")}đ?`, { confirmLabel: "Ghi nhận" }))) return;
    setBusy(true);
    try {
      const r = await frappeCall<{ customer_name: string; outstanding_text: string }>("cago.api.debt.record_repayment", {
        customer: picked.customer,
        amount: amt,
      });
      await alertDialog(`✅ Đã ghi nhận ${amt.toLocaleString("vi-VN")}đ.\n${r.customer_name} còn nợ: ${r.outstanding_text}.`);
      setPicked(null);
      setAmount("");
      void run(q.trim());
    } catch (e) {
      await alertDialog(`Lỗi: ${e instanceof Error ? e.message : "không ghi nhận được."}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  // ---- Amount view (a customer is picked) --------------------------------
  if (picked) {
    return (
      <div>
        <div className="mb-3.5 flex items-center gap-2.5">
          <button
            onClick={() => {
              setPicked(null);
              setAmount("");
            }}
            className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold"
          >
            ‹ Chọn khách khác
          </button>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xl font-bold">{picked.customer_name}</div>
          <div className="text-slate-500">
            {picked.village || ""} {picked.mobile ? `· ${picked.mobile}` : ""}
          </div>
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-800">Đang nợ: {picked.outstanding_text}</div>

          <label className="mt-4 block text-lg font-bold">Khách trả</label>
          <input
            autoFocus
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(fmtAmt(e.target.value))}
            placeholder="0"
            className="mt-1 w-full rounded-xl border-2 border-emerald-300 p-3 text-right text-3xl font-extrabold"
          />
          <span className="mt-1 block text-right text-slate-400">đồng</span>

          <button
            onClick={submit}
            disabled={busy || parseAmt(amount) <= 0}
            className="mt-4 min-h-[60px] w-full rounded-xl bg-brand text-2xl font-bold text-white disabled:opacity-50"
          >
            {busy ? "Đang ghi nhận..." : "💵 Ghi nhận trả nợ"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Pick-customer view ------------------------------------------------
  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">KHÁCH TRẢ NỢ</div>
      </div>

      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="🔎 Tìm khách theo tên, số điện thoại..."
        className="mb-3.5 w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg"
      />

      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy khách.</div>
      ) : (
        list.map((c) => (
          <button
            key={c.customer}
            onClick={() => setPicked(c)}
            className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3.5 text-left shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="font-bold">{c.customer_name}</div>
              <div className="truncate text-slate-500">
                {c.village || ""} {c.mobile ? `· ${c.mobile}` : ""}
              </div>
            </div>
            <div className={`shrink-0 font-bold ${c.outstanding_text === "Không nợ" ? "text-slate-400" : "text-amber-700"}`}>{c.outstanding_text}</div>
          </button>
        ))
      )}
    </div>
  );
}
