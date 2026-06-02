"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, Ok, Warn } from "./OwnerShared";
import type { ProductCard } from "@/lib/types";

type Sup = { supplier: string; supplier_name: string; mobile?: string; debt?: number; debt_text?: string; outstanding_text?: string };

export function SupplierDebt() {
  const router = useRouter();
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  if (!sel) return <SupplierList onBack={() => router.push("/owner")} onPick={(s) => setSel(s)} />;
  return <SupplierView supplier={sel.id} name={sel.name} onBack={() => setSel(null)} />;
}

function SupplierList({ onBack, onPick }: { onBack: () => void; onPick: (s: { id: string; name: string }) => void }) {
  const [owed, setOwed] = useState<Sup[]>([]);
  const [hits, setHits] = useState<Sup[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    frappeCall<Sup[]>("cago.api.supplier.supplier_debt_list", {}, { method: "GET" }).then((r) => setOwed(r || []));
  }, []);

  if (adding) {
    const save = async () => {
      setMsg(null);
      if (!form.name.trim()) return setMsg(<Warn>Nhập tên nhà cung cấp.</Warn>);
      try {
        const r = await frappeCall<{ supplier: string; supplier_name: string }>("cago.api.supplier.add_supplier", {
          supplier_name: form.name.trim(),
          phone: form.phone.trim(),
        });
        onPick({ id: r.supplier, name: r.supplier_name });
      } catch {
        setMsg(<Warn>Lỗi: không tạo được NCC.</Warn>);
      }
    };
    return (
      <div>
        <BackBar onBack={() => setAdding(false)} label="Quay lại" title="THÊM NHÀ CUNG CẤP" />
        <div className="rounded-xl bg-white p-4">
          <label className="block font-bold text-slate-700">Tên nhà cung cấp *</label>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Số điện thoại (tùy chọn)</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <button onClick={save} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
            Lưu nhà cung cấp
          </button>
          {msg}
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={onBack} title="CÔNG NỢ NHÀ CUNG CẤP" />
      <input
        onChange={(e) => {
          clearTimeout(tRef.current);
          tRef.current = setTimeout(async () => {
            const v = e.target.value.trim();
            setHits(v ? await frappeCall<Sup[]>("cago.api.supplier.search_suppliers", { query: v }, { method: "GET" }) : []);
          }, 250);
        }}
        placeholder="Tìm nhà cung cấp..."
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
      />
      {(hits.length ? hits : owed).map((s) => (
        <button key={s.supplier} onClick={() => onPick({ id: s.supplier, name: s.supplier_name })} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow">
          <div className="font-bold">{s.supplier_name}</div>
          <div className="font-bold text-red-600">{s.debt_text || s.outstanding_text || ""}</div>
        </button>
      ))}
      {!hits.length && !owed.length && <Ok>Không nợ nhà cung cấp nào. 🎉</Ok>}
      <button onClick={() => setAdding(true)} className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white">
        ➕ Thêm nhà cung cấp
      </button>
    </div>
  );
}

function SupplierView({ supplier, name, onBack }: { supplier: string; name: string; onBack: () => void }) {
  type Ledger = { outstanding_text: string; entries: { type: string; label: string; date: string; amount_text: string }[] };
  const [d, setD] = useState<Ledger | null>(null);
  const [tab, setTab] = useState<"ledger" | "pay" | "buy">("ledger");
  const load = async () => setD(await frappeCall<Ledger>("cago.api.supplier.get_supplier_ledger", { supplier }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  return (
    <div>
      <BackBar onBack={onBack} label="Danh sách NCC" title={name} />
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab("ledger")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "ledger" ? "bg-blue-600 text-white" : "bg-brand-light text-brand-dark"}`}>Sổ nợ</button>
        <button onClick={() => setTab("buy")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "buy" ? "bg-red-600 text-white" : "bg-brand-light text-brand-dark"}`}>📦 Nhập nợ</button>
        <button onClick={() => setTab("pay")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "pay" ? "bg-brand text-white" : "bg-brand-light text-brand-dark"}`}>💵 Trả tiền</button>
      </div>

      {tab === "ledger" && d && (
        <div className="rounded-xl bg-white p-4">
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">Đang nợ NCC</span>
            <span className="font-bold text-red-600">{d.outstanding_text}</span>
          </div>
          {d.entries.length === 0 && <div className="text-slate-500">Chưa có giao dịch.</div>}
          {d.entries.map((e, i) => (
            <div key={i} className="flex justify-between border-b border-slate-100 py-2">
              <span>
                <b>{e.type === "purchase" ? "📦" : "💵"} {e.label}</b>
                <br />
                <span className="text-slate-500">{e.date}</span>
              </span>
              <b className={e.type === "purchase" ? "text-red-600" : "text-brand"}>
                {e.type === "purchase" ? "+" : "−"}
                {e.amount_text}
              </b>
            </div>
          ))}
        </div>
      )}

      {tab === "pay" && <PaySupplier supplier={supplier} onDone={() => { setTab("ledger"); load(); }} />}
      {tab === "buy" && <CreditPurchase supplier={supplier} onDone={() => { setTab("ledger"); load(); }} />}
    </div>
  );
}

function PaySupplier({ supplier, onDone }: { supplier: string; onDone: () => void }) {
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const pay = async () => {
    if (busy) return;
    const v = parseVnd(amt);
    if (!v || v <= 0) return setMsg(<Warn>Nhập số tiền.</Warn>);
    setBusy(true);
    try {
      await frappeCall("cago.api.supplier.pay_supplier", { supplier, amount: v });
      onDone();
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi: không lưu được."}</Warn>);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl bg-white p-4">
      <label className="block font-bold text-slate-700">Số tiền trả NCC (đồng)</label>
      <input autoFocus inputMode="numeric" value={amt} onChange={(e) => setAmt(groupVnd(e.target.value))} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-3 text-xl" />
      <button onClick={pay} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">{busy ? "Đang lưu..." : "Xác nhận trả"}</button>
      {msg}
    </div>
  );
}

function CreditPurchase({ supplier, onDone }: { supplier: string; onDone: () => void }) {
  const [results, setResults] = useState<ProductCard[]>([]);
  const [lines, setLines] = useState<Record<string, { p: ProductCard; qty: number; rate: string }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: "" }, { method: "GET" }).then((r) => setResults(r || []));
  }, []);
  const lineList = Object.values(lines);
  const submit = async () => {
    setMsg(null);
    if (busy) return;
    const items = lineList.map((x) => ({ item_code: x.p.item_code, qty: x.qty, rate: parseVnd(x.rate) }));
    if (!items.length) return setMsg(<Warn>Chưa chọn sản phẩm.</Warn>);
    if (items.some((i) => i.rate <= 0)) return setMsg(<Warn>Nhập giá nhập cho mỗi sản phẩm.</Warn>);
    setBusy(true);
    try {
      await frappeCall("cago.api.supplier.credit_purchase", { supplier, items: JSON.stringify(items) });
      onDone();
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi nhập hàng."}</Warn>);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl bg-white p-4">
      {lineList.map((x) => (
        <div key={x.p.item_code} className="flex items-center gap-2 border-b border-slate-100 py-2">
          <span className="flex-1 font-bold">{x.p.display_name}</span>
          <input value={x.qty} onChange={(e) => setLines((l) => ({ ...l, [x.p.item_code]: { ...l[x.p.item_code], qty: Math.max(1, parseInt(e.target.value || "1", 10) || 1) } }))} inputMode="numeric" className="w-14 rounded border-2 border-emerald-300 p-1.5 text-center" />
          <input value={x.rate} onChange={(e) => setLines((l) => ({ ...l, [x.p.item_code]: { ...l[x.p.item_code], rate: groupVnd(e.target.value) } }))} inputMode="numeric" placeholder="giá nhập" className="w-24 rounded border-2 border-emerald-300 p-1.5" />
        </div>
      ))}
      {lineList.length > 0 && (
        <button onClick={submit} disabled={busy} className="my-2 min-h-touch w-full rounded-xl bg-red-600 font-extrabold text-white disabled:opacity-50">{busy ? "Đang nhập..." : "📦 Nhập hàng (ghi nợ NCC + tăng tồn)"}</button>
      )}
      {msg}
      <input
        onChange={(e) => {
          clearTimeout(tRef.current);
          tRef.current = setTimeout(async () => setResults(await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: e.target.value.trim() }, { method: "GET" })), 250);
        }}
        placeholder="Tìm sản phẩm để nhập..."
        className="mt-1 mb-2 w-full rounded-xl border-2 border-emerald-300 p-3"
      />
      {results.map((p) => (
        <button key={p.item_code} onClick={() => setLines((l) => ({ ...l, [p.item_code]: l[p.item_code] || { p, qty: 1, rate: "" } }))} className="mb-1.5 flex w-full justify-between rounded-lg bg-slate-50 p-2.5 text-left">
          <b>{p.display_name}</b>
          <span className="text-brand">+ Thêm</span>
        </button>
      ))}
    </div>
  );
}
