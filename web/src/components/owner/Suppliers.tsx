"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, goBackSmart } from "./Shared";
import { SearchInput } from "@/components/ui/ListUI";
import { toast } from "@/components/ui/toast";
import type { ProductCard } from "@/lib/types";

type Sup = { supplier: string; supplier_name: string; mobile?: string; note?: string; debt?: number; debt_text?: string; outstanding_text?: string; disabled?: boolean };

export function Suppliers() {
  const router = useRouter();
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  if (!sel) return <SupplierList onBack={() => goBackSmart(router)} onPick={(s) => setSel(s)} />;
  return <SupplierView supplier={sel.id} name={sel.name} onBack={() => setSel(null)} />;
}

function SupplierList({ onBack, onPick }: { onBack: () => void; onPick: (s: { id: string; name: string }) => void }) {
  const [all, setAll] = useState<Sup[]>([]);
  const [hits, setHits] = useState<Sup[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      const t = v.trim();
      setHits(t ? await frappeCall<Sup[]>("cago.api.supplier.search_suppliers", { query: t }, { method: "GET" }) : []);
    }, 250);
  };

  useEffect(() => {
    // The full supplier list (incl. ngừng-dùng) — a real manage list, not only those currently owed.
    frappeCall<Sup[]>("cago.api.supplier.list_suppliers", {}, { method: "GET" }).then((r) => setAll(r || []));
  }, []);

  if (adding) {
    const save = async () => {
      if (!form.name.trim()) {
        toast.error("Nhập tên nhà cung cấp.");
        return;
      }
      try {
        const r = await frappeCall<{ supplier: string; supplier_name: string }>("cago.api.supplier.add_supplier", {
          supplier_name: form.name.trim(),
          phone: form.phone.trim(),
          note: form.note.trim(),
        });
        onPick({ id: r.supplier, name: r.supplier_name });
      } catch {
        toast.error("Lỗi: không tạo được NCC.");
      }
    };
    return (
      <div>
        <BackBar onBack={() => setAdding(false)} label="Quay lại" title="Thêm nhà cung cấp" />
        <div className="rounded-xl bg-white p-4">
          <label className="block font-bold text-slate-700">Tên nhà cung cấp *</label>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Số điện thoại (tùy chọn)</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Ghi chú (địa chỉ, mặt hàng…)</label>
          <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <button onClick={save} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
            Lưu nhà cung cấp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={onBack} title="Nhà cung cấp" />
      <button onClick={() => setAdding(true)} className="mt-tile mb-3 min-h-[60px] w-full bg-teal-600 text-lg">
        ➕ Thêm nhà cung cấp
      </button>
      <SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm nhà cung cấp..." />
      <div className="md:grid md:grid-cols-2 md:gap-x-3">
      {(hits.length ? hits : all).map((s) => (
        <button key={s.supplier} onClick={() => onPick({ id: s.supplier, name: s.supplier_name })} className={`mb-2 flex w-full items-center justify-between rounded-xl p-3.5 text-left shadow ${s.disabled ? "bg-slate-100 opacity-70" : "bg-white"}`}>
          <div className="min-w-0">
            <div className="font-bold">{s.supplier_name} {s.disabled && <span className="text-xs font-bold text-slate-400">· ngừng dùng</span>}</div>
            {s.mobile && <div className="text-sm text-slate-500">📞 {s.mobile}</div>}
          </div>
          <div className="shrink-0 font-bold text-red-600">{(s.debt || 0) > 0 ? s.debt_text || s.outstanding_text : ""}</div>
        </button>
      ))}
      </div>
      {!hits.length && !all.length && <div className="rounded-xl bg-white p-6 text-center text-slate-400">Chưa có nhà cung cấp nào.</div>}
    </div>
  );
}

function SupplierView({ supplier, name, onBack }: { supplier: string; name: string; onBack: () => void }) {
  type Ledger = { supplier_name: string; outstanding_text: string; mobile?: string; note?: string; disabled?: boolean; entries: { type: string; label: string; date: string; amount_text: string }[] };
  const [d, setD] = useState<Ledger | null>(null);
  const [tab, setTab] = useState<"ledger" | "pay" | "buy" | "edit">("ledger");
  const [edit, setEdit] = useState({ name: "", phone: "", note: "" });
  const load = async () => {
    const r = await frappeCall<Ledger>("cago.api.supplier.get_supplier_ledger", { supplier }, { method: "GET" });
    setD(r);
    setEdit({ name: r.supplier_name || name, phone: r.mobile || "", note: r.note || "" });
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  const saveInfo = async () => {
    try {
      await frappeCall("cago.api.supplier.save_supplier", { supplier, supplier_name: edit.name.trim(), phone: edit.phone.trim(), note: edit.note.trim() });
      toast.success("Đã lưu thông tin NCC.");
      setTab("ledger");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    }
  };
  const toggleActive = async () => {
    try {
      await frappeCall("cago.api.supplier.set_supplier_active", { supplier, active: d?.disabled ? 1 : 0 });
      toast.success(d?.disabled ? "Đã dùng lại NCC." : "Đã ngừng dùng NCC (vẫn giữ lịch sử).");
      void load();
    } catch {
      toast.error("Lỗi: không đổi được trạng thái.");
    }
  };

  return (
    <div>
      <BackBar onBack={onBack} label="Danh sách NCC" title={name} />
      {d?.disabled && <div className="mb-2 rounded-lg bg-slate-100 p-2 text-center text-sm font-bold text-slate-500">NCC này đang NGỪNG DÙNG (vẫn xem được lịch sử)</div>}
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={() => setTab("ledger")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "ledger" ? "bg-blue-600 text-white" : "bg-brand-light text-brand-dark"}`}>Sổ nợ</button>
        <button onClick={() => setTab("buy")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "buy" ? "bg-red-600 text-white" : "bg-brand-light text-brand-dark"}`}>📦 Nhập nợ</button>
        <button onClick={() => setTab("pay")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "pay" ? "bg-brand text-white" : "bg-brand-light text-brand-dark"}`}>💵 Trả tiền</button>
        <button onClick={() => setTab("edit")} className={`rounded-xl px-4 py-2.5 font-bold ${tab === "edit" ? "bg-slate-600 text-white" : "bg-brand-light text-brand-dark"}`}>✏️ Sửa</button>
      </div>

      {tab === "edit" && (
        <div className="rounded-xl bg-white p-4">
          <label className="block font-bold text-slate-700">Tên NCC</label>
          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Số điện thoại</label>
          <input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Ghi chú (địa chỉ, mặt hàng…)</label>
          <textarea rows={2} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <button onClick={saveInfo} className="mt-1 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">💾 Lưu thông tin</button>
          <button onClick={toggleActive} className={`mt-2 min-h-touch w-full rounded-xl font-extrabold text-white ${d?.disabled ? "bg-teal-600" : "bg-amber-600"}`}>
            {d?.disabled ? "♻️ Dùng lại NCC này" : "🚫 Ngừng dùng NCC này"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">Ngừng dùng = ẩn khỏi chọn khi nhập hàng, nhưng GIỮ toàn bộ lịch sử nợ/nhập để truy vết.</p>
        </div>
      )}

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
  const pay = async () => {
    if (busy) return;
    const v = parseVnd(amt);
    if (!v || v <= 0) {
      toast.error("Nhập số tiền.");
      return;
    }
    setBusy(true);
    try {
      await frappeCall("cago.api.supplier.pay_supplier", { supplier, amount: v });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl bg-white p-4">
      <label className="block font-bold text-slate-700">Số tiền trả NCC (đồng)</label>
      <input autoFocus inputMode="numeric" value={amt} onChange={(e) => setAmt(groupVnd(e.target.value))} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-3 text-xl" />
      <button onClick={pay} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">{busy ? "Đang lưu..." : "Xác nhận trả"}</button>
    </div>
  );
}

function CreditPurchase({ supplier, onDone }: { supplier: string; onDone: () => void }) {
  const [results, setResults] = useState<ProductCard[]>([]);
  const [lines, setLines] = useState<Record<string, { p: ProductCard; qty: number; rate: string }>>({});
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: "" }, { method: "GET" }).then((r) => setResults(r || []));
  }, []);
  const lineList = Object.values(lines);
  const submit = async () => {
    if (busy) return;
    const items = lineList.map((x) => ({ item_code: x.p.item_code, qty: x.qty, rate: parseVnd(x.rate) }));
    if (!items.length) {
      toast.error("Chưa chọn sản phẩm.");
      return;
    }
    if (items.some((i) => i.rate <= 0)) {
      toast.error("Nhập giá nhập cho mỗi sản phẩm.");
      return;
    }
    setBusy(true);
    try {
      await frappeCall("cago.api.supplier.credit_purchase", { supplier, items: JSON.stringify(items) });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi nhập hàng.");
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
      <input
        onChange={(e) => {
          clearTimeout(tRef.current);
          tRef.current = setTimeout(async () => setResults(await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: e.target.value.trim() }, { method: "GET" })), 250);
        }}
        enterKeyHint="search" placeholder="Tìm sản phẩm để nhập..."
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
