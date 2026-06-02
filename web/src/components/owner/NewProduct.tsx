"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, Warn } from "./OwnerShared";

export function NewProduct() {
  const router = useRouter();
  const [meta, setMeta] = useState<{ item_groups: string[]; uoms: string[]; stock_status_options: string[] } | null>(null);
  const [f, setF] = useState({ name: "", group: "", unit: "Bao", price: "", stock: "", chem: false, pub: true });
  const [msg, setMsg] = useState<React.ReactNode>(null);

  useEffect(() => {
    frappeCall<typeof meta>("cago.api.owner.get_product_meta", {}, { method: "GET" })
      .then(setMeta)
      .catch(() => {});
  }, []);
  if (!meta) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  const create = async () => {
    setMsg(null);
    if (!f.name.trim()) return setMsg(<Warn>Nhập tên sản phẩm.</Warn>);
    if (!f.group) return setMsg(<Warn>Chọn nhóm hàng.</Warn>);
    try {
      const r = await frappeCall<{ item_code: string }>("cago.api.owner.create_product", {
        data: JSON.stringify({
          cago_display_name: f.name.trim(),
          item_group: f.group,
          stock_uom: f.unit.trim(),
          // Strip grouping so "150.000" → 150000, not flt("150.000")=150 server-side.
          selling_price: parseVnd(f.price),
          cago_stock_status_manual: f.stock,
          cago_is_chemical: f.chem ? 1 : 0,
          cago_is_public_visible: f.pub ? 1 : 0,
        }),
      });
      router.push(`/owner/products/${encodeURIComponent(r.item_code)}/edit`);
    } catch {
      setMsg(<Warn>Lỗi: không tạo được sản phẩm.</Warn>);
    }
  };

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="THÊM SẢN PHẨM" />
      <div className="rounded-xl bg-white p-4">
        <label className="block font-bold text-slate-700">Tên sản phẩm *</label>
        <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="block font-bold text-slate-700">Nhóm hàng *</label>
        <select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5">
          {["", ...meta.item_groups].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <label className="block font-bold text-slate-700">Đơn vị (Bao/Gói/Chai...) *</label>
        <input list="uoms" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <datalist id="uoms">
          {meta.uoms.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <label className="block font-bold text-slate-700">Giá bán (đồng)</label>
        <input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: groupVnd(e.target.value) })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="block font-bold text-slate-700">Tồn kho hiển thị</label>
        <select value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5">
          {["", ...meta.stock_status_options].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <label className="mt-1 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={f.chem} onChange={(e) => setF({ ...f, chem: e.target.checked })} className="h-5 w-5" /> Là hóa chất/thuốc
        </label>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={f.pub} onChange={(e) => setF({ ...f, pub: e.target.checked })} className="h-5 w-5" /> Hiển thị trên kiosk
        </label>
        <button onClick={create} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          Tạo sản phẩm
        </button>
        {msg}
      </div>
    </div>
  );
}
