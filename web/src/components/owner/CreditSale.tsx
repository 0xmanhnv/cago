"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { BackBar, goBackSmart, CustomerPicker, Ok } from "./OwnerShared";
import { toast } from "@/components/ui/toast";
import type { ProductCard } from "@/lib/types";

export function CreditSale() {
  const router = useRouter();
  const [customer, setCustomer] = useState<string | null>(null);

  if (!customer)
    return (
      <CustomerPicker
        title="BÁN CHỊU (giao hàng + ghi nợ)"
        onBack={() => goBackSmart(router)}
        onPick={(c) => setCustomer(c)}
      />
    );
  return <Cart customer={customer} onBack={() => setCustomer(null)} onHome={() => router.push("/pos")} />;
}

function Cart({ customer, onBack, onHome }: { customer: string; onBack: () => void; onHome: () => void }) {
  const [results, setResults] = useState<ProductCard[]>([]);
  const [lines, setLines] = useState<Record<string, { p: ProductCard; qty: number }>>({});
  const [result, setResult] = useState<{ total_text: string; outstanding_text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = async (q: string) => {
    const r = await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: q }, { method: "GET" });
    setResults(r || []);
  };
  useEffect(() => {
    void search("");
  }, []);

  const add = (p: ProductCard) => setLines((l) => ({ ...l, [p.item_code]: { p, qty: (l[p.item_code]?.qty || 0) + 1 } }));
  const setQty = (code: string, qty: number) =>
    setLines((l) => {
      const n = { ...l };
      if (qty <= 0) delete n[code];
      else n[code] = { ...n[code], qty };
      return n;
    });

  const submit = async () => {
    if (busy) return;
    const items = Object.values(lines).map((x) => ({ item_code: x.p.item_code, qty: x.qty }));
    if (!items.length) {
      toast.error("Chưa chọn sản phẩm.");
      return;
    }
    const total = items.reduce((s, i) => s + i.qty, 0);
    if (!(await confirmDialog(`Tạo hoá đơn bán chịu (giao ${total} món, ghi nợ khách)?`, { danger: true, confirmLabel: "Tạo & ghi nợ" }))) return;
    setBusy(true);
    try {
      const r = await frappeCall<{ total_text: string; outstanding_text: string }>("cago.api.sales.credit_sale", {
        customer,
        items: JSON.stringify(items),
      });
      setResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không tạo được hoá đơn.");
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <div>
        <BackBar onBack={onHome} label="Trang chủ" />
        <Ok>
          ✅ Đã tạo hoá đơn bán chịu. Tổng <b>{result.total_text}</b> — đã trừ tồn kho. Khách đang nợ:{" "}
          <b>{result.outstanding_text}</b>.
        </Ok>
        <button onClick={onHome} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          Xong
        </button>
      </div>
    );

  const lineList = Object.values(lines);
  return (
    <div>
      <BackBar onBack={onBack} label="Chọn khách khác" title="BÁN CHỊU" />

      {lineList.length > 0 && (
        <div className="mb-3 rounded-xl bg-white p-3">
          <div className="mb-1 font-extrabold">Đã chọn</div>
          {lineList.map((x) => (
            <div key={x.p.item_code} className="flex items-center justify-between border-b border-slate-100 py-2">
              <span className="flex-1">
                <b>{x.p.display_name}</b>
                <br />
                <span className="text-brand">{x.p.price_text}</span>
              </span>
              <span className="flex items-center gap-2">
                <button onClick={() => setQty(x.p.item_code, x.qty - 1)} className="h-10 w-10 rounded-lg bg-brand-light text-xl font-extrabold">
                  −
                </button>
                <b className="text-lg">{x.qty}</b>
                <button onClick={() => setQty(x.p.item_code, x.qty + 1)} className="h-10 w-10 rounded-lg bg-brand-light text-xl font-extrabold">
                  +
                </button>
              </span>
            </div>
          ))}
          <button onClick={submit} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-red-600 font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang tạo..." : "🧾 Tạo hoá đơn bán chịu (trừ tồn + ghi nợ)"}
          </button>
        </div>
      )}

      <input
        onChange={(e) => {
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => search(e.target.value.trim()), 250);
        }}
        placeholder="Tìm sản phẩm để thêm..."
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
        autoFocus
      />
      {results.map((p) => (
        <button key={p.item_code} onClick={() => add(p)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3 text-left shadow">
          <span>
            <b>{p.display_name}</b> <span className="text-brand">{p.price_text}</span>
            <br />
            <span className="text-sm text-slate-500">{p.stock_status}</span>
          </span>
          <span className="rounded-lg bg-brand px-3 py-2 font-extrabold text-white">+ Thêm</span>
        </button>
      ))}
    </div>
  );
}
