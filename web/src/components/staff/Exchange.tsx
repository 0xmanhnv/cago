"use client";

import { uomLabel } from "@/lib/uom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { BackBar, money, ProductPicker } from "@/components/owner/Shared";

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
  time: string;
  item_count: number;
}
interface NewItem {
  item_code: string;
  name: string;
  qty: number;
}
interface ExchangeResult {
  net_text: string;
  net_direction: "collect" | "refund" | "even";
  refund_text: string;
  new_total_text: string;
}

const PAYMENTS = [
  { k: "cash", label: "💵 Tiền mặt" },
  { k: "bank", label: "🏦 Chuyển khoản" },
  { k: "credit", label: "📒 Ghi nợ" },
] as const;

export function Exchange() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [sel, setSel] = useState<SaleRow | null>(null);
  const [retLines, setRetLines] = useState<RetLine[]>([]);
  const [retQty, setRetQty] = useState<Record<string, string>>({});
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [pay, setPay] = useState<(typeof PAYMENTS)[number]["k"]>("cash");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExchangeResult | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = (val: string) => {
    setQ(val);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      try {
        setRows((await frappeCall<SaleRow[]>("cago.api.sales.list_recent_sales", { status: "returnable", query: val.trim(), start: 0, limit: 30 }, { method: "GET" })) || []);
      } catch {
        setRows([]);
      }
    }, 300);
  };

  useEffect(() => {
    void search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSale = async (s: SaleRow) => {
    setSel(s);
    try {
      const r = await frappeCall<{ lines: RetLine[] }>("cago.api.sales.get_returnable", { invoice: s.invoice }, { method: "GET" });
      setRetLines(r.lines || []);
      setRetQty({});
    } catch {
      setRetLines([]);
    }
  };

  const addNew = async (code: string) => {
    setPicking(false);
    if (newItems.some((n) => n.item_code === code)) return;
    try {
      const [l] = await frappeCall<{ display_name: string }[]>("cago.api.catalog.label_data", { codes: JSON.stringify([code]) }, { method: "GET" });
      setNewItems((x) => [...x, { item_code: code, name: l?.display_name || code, qty: 1 }]);
    } catch {
      /* ignore */
    }
  };

  const retParsed = retLines.map((l) => ({ ...l, q: Math.max(0, Math.min(l.remaining, parseFloat((retQty[l.item_code] || "0").replace(",", ".")) || 0)) }));
  const refundEstimate = retParsed.reduce((s, l) => s + l.q * l.rate, 0);

  const confirm = async () => {
    if (busy || !sel) return;
    const return_lines = retParsed.filter((l) => l.q > 0).map((l) => ({ item_code: l.item_code, qty: l.q }));
    const new_items = newItems.filter((n) => n.qty > 0).map((n) => ({ item_code: n.item_code, qty: n.qty }));
    if (!return_lines.length) return toast.error("Chọn hàng trả lại (lớn hơn 0).");
    if (!new_items.length) return toast.error("Chọn hàng đổi lấy.");
    setBusy(true);
    try {
      const r = await frappeCall<ExchangeResult>("cago.api.sales.exchange_sale", {
        invoice: sel.invoice,
        return_lines: JSON.stringify(return_lines),
        new_items: JSON.stringify(new_items),
        payment_mode: pay,
      });
      setResult(r);
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không đổi được."}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setSel(null);
    setRetLines([]);
    setRetQty({});
    setNewItems([]);
    void search("");
  };

  if (picking) return <ProductPicker title="Chọn hàng đổi lấy" onBack={() => setPicking(false)} onPick={addNew} />;

  return (
    <div className="pb-10">
      <BackBar title="↔️ ĐỔI HÀNG" onBack={() => router.push("/pos")} />

      {!sel ? (
        <>
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            enterKeyHint="search" placeholder="🔎 Tìm hoá đơn cần đổi (số HĐ / tên khách)…"
            className="mb-3 w-full rounded-xl border-2 border-emerald-200 p-3 text-base"
          />
          {rows.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không có hoá đơn đổi được.</div>
          ) : (
            rows.map((s) => (
              <button key={s.invoice} onClick={() => pickSale(s)} className="mb-2.5 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold">{s.customer_name}</div>
                  <div className="text-xs text-slate-400">{s.invoice} · {s.item_count} món · {s.time}</div>
                </div>
                <div className="font-bold text-brand">{s.total_text}</div>
              </button>
            ))
          )}
        </>
      ) : (
        <>
          <div className="mb-3 rounded-xl bg-slate-50 p-3 text-sm">
            <button onClick={reset} className="float-right text-sm font-bold text-brand">Đổi hoá đơn</button>
            <div className="font-bold text-slate-800">👤 {sel.customer_name}</div>
            <div className="text-slate-500">{sel.invoice} · {sel.total_text}</div>
          </div>

          <div className="mb-1 font-extrabold text-rose-700">① Khách trả lại</div>
          {retLines.length === 0 ? (
            <div className="rounded-xl bg-white p-4 text-center text-slate-400">Đơn này đã trả hết.</div>
          ) : (
            retLines.map((l) => {
              const cur = parseFloat((retQty[l.item_code] || "0").replace(",", ".")) || 0;
              const set = (v: number) => setRetQty((qq) => ({ ...qq, [l.item_code]: String(Math.max(0, Math.min(l.remaining, +v.toFixed(2)))) }));
              return (
                <div key={l.item_code} className="mb-2 rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 font-bold leading-tight">{l.name}</span>
                    <span className="shrink-0 text-sm text-slate-500">{l.rate_text}</span>
                  </div>
                  <div className="text-xs text-slate-400">Còn trả được: {l.remaining} {uomLabel(l.uom)}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button onClick={() => set(cur - 1)} className="h-10 w-10 shrink-0 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                    <input inputMode="decimal" value={retQty[l.item_code] ?? ""} onChange={(e) => setRetQty((qq) => ({ ...qq, [l.item_code]: e.target.value }))} className="h-10 w-20 shrink-0 rounded-lg border-2 border-emerald-300 text-center text-lg font-extrabold" />
                    <button onClick={() => set(cur + 1)} className="h-10 w-10 shrink-0 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                    <span className="text-slate-500">{uomLabel(l.uom)}</span>
                  </div>
                </div>
              );
            })
          )}

          <div className="mb-1 mt-4 font-extrabold text-brand-dark">② Đổi lấy hàng mới</div>
          {newItems.map((n, i) => (
            <div key={n.item_code} className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
              <span className="min-w-0 flex-1 truncate font-bold">{n.name}</span>
              <button onClick={() => setNewItems((x) => x.map((it, j) => (j === i ? { ...it, qty: Math.max(1, it.qty - 1) } : it)))} className="h-10 w-10 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
              <input inputMode="decimal" value={n.qty} onChange={(e) => setNewItems((x) => x.map((it, j) => (j === i ? { ...it, qty: Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0) } : it)))} className="h-10 w-16 rounded-lg border-2 border-emerald-300 text-center text-lg font-extrabold" />
              <button onClick={() => setNewItems((x) => x.map((it, j) => (j === i ? { ...it, qty: it.qty + 1 } : it)))} className="h-10 w-10 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
              <button onClick={() => setNewItems((x) => x.filter((_, j) => j !== i))} className="h-9 w-9 rounded-lg bg-rose-100 font-bold text-rose-700">×</button>
            </div>
          ))}
          <button onClick={() => setPicking(true)} className="mb-3 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white">➕ Thêm hàng đổi lấy</button>

          <div className="mb-2 grid grid-cols-3 gap-2">
            {PAYMENTS.map((p) => (
              <button key={p.k} onClick={() => setPay(p.k)} className={`rounded-xl py-2.5 text-sm font-bold ${pay === p.k ? "bg-brand text-white" : "bg-white text-slate-700 shadow-sm"}`}>{p.label}</button>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2.5 text-sm">
            <span className="text-slate-600">Hoàn lại (hàng trả): {money(refundEstimate)}</span>
            <span className="text-slate-500">Chênh lệch tính khi xác nhận</span>
          </div>
          <button onClick={confirm} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang xử lý..." : "↔️ Xác nhận đổi hàng"}
          </button>
        </>
      )}

      {result && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
            <div className="text-5xl">{result.net_direction === "even" ? "✅" : result.net_direction === "collect" ? "💰" : "↩️"}</div>
            <div className="mt-2 text-xl font-extrabold">Đã đổi hàng xong</div>
            <div className="mt-1 text-sm text-slate-500">Hoàn {result.refund_text} · Hàng mới {result.new_total_text}</div>
            <div className={`mt-3 rounded-xl p-3 text-2xl font-extrabold ${result.net_direction === "collect" ? "bg-brand/10 text-brand-dark" : result.net_direction === "refund" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
              {result.net_direction === "collect" && `Thu thêm: ${result.net_text}`}
              {result.net_direction === "refund" && `Trả lại khách: ${result.net_text}`}
              {result.net_direction === "even" && "Không chênh lệch"}
            </div>
            <button onClick={reset} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">Đổi đơn khác</button>
          </div>
        </div>
      )}
    </div>
  );
}
