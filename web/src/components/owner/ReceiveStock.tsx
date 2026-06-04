"use client";

import { uomLabel } from "@/lib/uom";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { BackBar, goBackSmart, ProductPicker, money } from "./Shared";
import { groupVnd } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

interface Stock {
  qty: number;
  uom: string;
  has_batch: boolean;
  batches: { batch_id: string; expiry_date?: string }[];
}
interface Prod {
  display_name: string;
  price_text: string;
  unit?: string;
}

const num = (s: string) => parseInt((s || "").replace(/[^\d]/g, ""), 10) || 0;

export function ReceiveStock() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [prod, setProd] = useState<Prod | null>(null);
  const [stock, setStock] = useState<Stock | null>(null);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [batch, setBatch] = useState("");
  const [newBatch, setNewBatch] = useState({ id: "", hsd: "" });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (c: string) => {
    setCode(c);
    setQty("");
    setCost("");
    setBatch("");
    try {
      const [p, s] = await Promise.all([
        frappeCall<Prod>("cago.api.owner.get_product", { item_code: c }, { method: "GET" }),
        frappeCall<Stock>("cago.api.purchasing.get_stock", { item_code: c }, { method: "GET" }),
      ]);
      setProd(p);
      setStock(s);
    } catch {
      toast.error("Không tải được sản phẩm.");
    }
  };

  const refreshStock = async () => {
    if (!code) return;
    setStock(await frappeCall<Stock>("cago.api.purchasing.get_stock", { item_code: code }, { method: "GET" }));
  };

  const addBatch = async () => {
    if (!code || !newBatch.id.trim()) {
      toast.error("Nhập mã lô.");
      return;
    }
    setBusy(true);
    try {
      await frappeCall("cago.api.inventory.add_batch", { item_code: code, batch_id: newBatch.id.trim(), expiry_date: newBatch.hsd || null });
      await refreshStock();
      setBatch(newBatch.id.trim());
      setNewBatch({ id: "", hsd: "" });
      setAdding(false);
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không thêm được lô."}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!code) return;
    const q = num(qty);
    if (q <= 0) {
      toast.error("Nhập số lượng lớn hơn 0.");
      return;
    }
    if (stock?.has_batch && !batch) {
      toast.error("Chọn lô (hoặc thêm lô mới) trước khi nhập.");
      return;
    }
    if (!(await confirmDialog(`Nhập ${q} ${uomLabel(stock?.uom)}${cost ? ` · giá vốn ${money(num(cost))}/${uomLabel(stock?.uom)}` : ""}?`, { confirmLabel: "Nhập kho" }))) return;
    setBusy(true);
    try {
      const r = await frappeCall<{ qty: number }>("cago.api.purchasing.receive_stock", {
        item_code: code,
        qty: q,
        cost_rate: cost ? num(cost) : null,
        batch_no: batch || null,
      });
      setStock((s) => (s ? { ...s, qty: r.qty } : s));
      setQty("");
      setCost("");
      toast.success(`Đã nhập kho. Tồn mới: ${r.qty} ${uomLabel(stock?.uom)}.`);
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không nhập được."}`);
    } finally {
      setBusy(false);
    }
  };

  if (!code) {
    return (
      <div className="mx-auto max-w-[760px]">
        <ProductPicker title="NHẬP HÀNG" onBack={() => goBackSmart(router)} onPick={pick} />
        <button onClick={() => router.push("/pos/bulk")} className="mt-3 w-full rounded-xl border-2 border-teal-300 bg-white py-3 font-extrabold text-teal-700">
          ⚡ Nhập nhiều mặt cùng lúc (nhập loạt) →
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => setCode(null)} title="NHẬP HÀNG" label="Chọn sản phẩm khác" />
      <div className="mt-card p-4">
        <div className="text-xl font-extrabold text-brand-dark">{prod?.display_name || code}</div>
        <div className="text-slate-500">
          Giá bán: <b className="text-brand">{prod?.price_text}</b> · Tồn hiện tại: <b>{stock?.qty ?? "…"} {uomLabel(stock?.uom)}</b>
        </div>

        {/* qty + cost side-by-side on desktop (sm+), stacked on phones. */}
        <div className="mt-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <div>
            <label className="block font-bold text-slate-700">Số lượng nhập ({uomLabel(stock?.uom)})</label>
            <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className="mt-1 w-full rounded-2xl border-2 border-emerald-300 p-3.5 text-2xl font-extrabold" />
          </div>
          <div className="mt-3 sm:mt-0">
            <label className="block font-bold text-slate-700">Giá vốn / {uomLabel(stock?.uom)} <span className="font-normal text-slate-400">(nên nhập để tính lãi)</span></label>
            <input inputMode="numeric" value={cost} onChange={(e) => setCost(groupVnd(e.target.value))} placeholder="0" className="mt-1 w-full rounded-2xl border-2 border-amber-300 p-3.5 text-xl font-bold text-right" />
          </div>
        </div>

        {stock?.has_batch && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-1 font-bold text-brand-dark">Lô / hạn dùng (hoá chất)</div>
            <div className="flex flex-wrap gap-2">
              {(stock.batches || []).map((b) => (
                <button
                  key={b.batch_id}
                  onClick={() => setBatch(b.batch_id)}
                  className={`rounded-lg border px-3 py-2 text-sm font-bold ${batch === b.batch_id ? "border-brand bg-brand text-white" : "border-emerald-300 bg-white text-brand-dark"}`}
                >
                  {b.batch_id}{b.expiry_date ? ` · HSD ${b.expiry_date}` : ""}
                </button>
              ))}
              <button onClick={() => setAdding((v) => !v)} className="rounded-lg border-2 border-dashed border-teal-400 px-3 py-2 text-sm font-bold text-teal-700">➕ Lô mới</button>
            </div>
            {adding && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input value={newBatch.id} onChange={(e) => setNewBatch({ ...newBatch, id: e.target.value })} placeholder="Mã lô" className="rounded-lg border-2 border-emerald-300 p-2.5" />
                <input type="date" value={newBatch.hsd} onChange={(e) => setNewBatch({ ...newBatch, hsd: e.target.value })} className="rounded-lg border-2 border-emerald-300 p-2.5" />
                <button onClick={addBatch} disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">Lưu lô</button>
              </div>
            )}
          </div>
        )}

        <button onClick={submit} disabled={busy} className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white shadow-soft disabled:opacity-50">
          {busy ? "Đang nhập..." : "📥 Nhập kho"}
        </button>
      </div>
    </div>
  );
}
