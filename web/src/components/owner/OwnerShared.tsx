"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import type { ProductCard } from "@/lib/types";

export const money = (n: number) => n.toLocaleString("vi-VN") + "đ";

export function BackBar({ onBack, title, label = "Trang chủ" }: { onBack: () => void; title?: string; label?: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <button onClick={onBack} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
        ← {label}
      </button>
      {title && <div className="flex-1 text-xl font-bold text-brand-dark">{title}</div>}
    </div>
  );
}

export function Warn({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">{children}</div>;
}
export function Ok({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-lg border border-emerald-400 bg-emerald-100 p-3 text-emerald-900">{children}</div>;
}

export function DraftModal({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h3 className="text-lg font-bold">📩 Tin nhắn (sao chép gửi Zalo)</h3>
        <textarea readOnly value={text} rows={5} className="mt-2 w-full rounded-lg border-2 border-slate-300 p-3 text-base" />
        <div className="mt-3 flex gap-2.5">
          <button
            onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}
            className="min-h-touch flex-1 rounded-xl bg-brand font-extrabold text-white"
          >
            {copied ? "✅ Đã sao chép" : "📋 Sao chép"}
          </button>
          <button onClick={onClose} className="min-h-touch flex-1 rounded-xl bg-slate-200 font-extrabold text-slate-700">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/** Product search + list; calls onPick(item_code). */
export function ProductPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (code: string) => void }) {
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = async (q: string) => {
    setLoading(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: q }, { method: "GET" });
      setList(r || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);
  const findBarcode = async (code: string) => {
    if (!code.trim()) return;
    const r = await frappeCall<{ item_code: string | null }>(
      "cago.api.catalog.find_by_barcode",
      { barcode: code.trim() },
      { method: "GET" },
    );
    if (r.item_code) onPick(r.item_code);
    else alert("Không tìm thấy sản phẩm với mã vạch này.");
  };
  return (
    <div>
      <BackBar onBack={onBack} />
      <input
        autoFocus
        onChange={(e) => {
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="Tên, tên hay gọi, màu bao..."
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
      />
      <input
        placeholder="⌨ Quét/nhập mã vạch rồi Enter"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void findBarcode((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3 text-base"
      />
      <div className="text-xl font-bold text-brand-dark">{title}</div>
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        list.map((p) => (
          <button key={p.item_code} onClick={() => onPick(p.item_code)} className="mb-3 flex w-full gap-3 rounded-xl bg-white p-3.5 text-left shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.image && <img src={p.image} alt="" className="h-[60px] w-[60px] rounded-lg object-cover" />}
            <div>
              <div className="font-bold">{p.display_name}</div>
              <div className="font-bold text-brand">{p.price_text}</div>
              <div className="text-slate-500">{p.stock_status}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

interface CustomerHit {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  debt?: number;
}

/** Customer search with "add new"; calls onPick(customer). */
export function CustomerPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (c: string) => void }) {
  const [list, setList] = useState<CustomerHit[]>([]);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);
  const [form, setForm] = useState({ name: "", phone: "", village: "", limit: "" });
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const run = async (query: string) => {
    const r = await frappeCall<CustomerHit[]>("cago.api.debt.search_customers", { query }, { method: "GET" });
    setList(r || []);
  };
  useEffect(() => {
    void run("");
  }, []);

  if (adding) {
    const save = async () => {
      setMsg(null);
      if (savingRef.current) return;
      if (!form.name.trim()) return setMsg(<Warn>Nhập tên khách.</Warn>);
      savingRef.current = true;
      try {
        const r = await frappeCall<{ customer: string }>("cago.api.debt.add_customer", {
          customer_name: form.name.trim(),
          phone: form.phone.trim(),
          village: form.village.trim(),
          debt_limit: form.limit ? parseFloat(form.limit) : 0,
        });
        onPick(r.customer);
      } catch (e) {
        setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi: không tạo được khách."}</Warn>);
        savingRef.current = false;
      }
    };
    return (
      <div>
        <BackBar onBack={() => setAdding(false)} label="Quay lại" title="THÊM KHÁCH MỚI" />
        <div className="rounded-xl bg-white p-4">
          <label className="block font-bold text-slate-700">Tên khách *</label>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Số điện thoại (tùy chọn)</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="VD: 0987654321" className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Xóm/thôn (tùy chọn)</label>
          <input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Hạn mức nợ (tùy chọn, đồng)</label>
          <input inputMode="numeric" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} placeholder="Để trống = không giới hạn" className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <button onClick={save} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
            Lưu khách
          </button>
          {msg}
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={onBack} />
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="Tên khách, xóm..."
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
      />
      <div className="text-xl font-bold text-brand-dark">{title}</div>
      <div className="mb-1 text-sm text-slate-500">Chọn khách để thực hiện — số bên phải là nợ hiện tại của khách (để xem ai đang nợ, vào &quot;📒 Công nợ khách&quot;).</div>
      {list.length === 0 ? (
        <div className="my-2 text-slate-500">Không tìm thấy khách. Bấm &quot;Thêm khách mới&quot; bên dưới.</div>
      ) : (
        list.map((c) => (
          <button key={c.customer} onClick={() => onPick(c.customer)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow">
            <div>
              <div className="font-bold">{c.customer_name}</div>
              <div className="text-slate-500">
                {c.village || ""} {c.mobile ? `· ${c.mobile}` : ""}
              </div>
            </div>
            <div className={c.debt && c.debt > 0 ? "font-bold text-red-600" : "text-slate-400"}>
              {c.debt && c.debt > 0 ? money(c.debt) : "Không nợ"}
            </div>
          </button>
        ))
      )}
      <button onClick={() => setAdding(true)} className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white">
        ➕ Thêm khách mới
      </button>
    </div>
  );
}
