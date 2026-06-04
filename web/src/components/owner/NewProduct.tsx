"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, goBackSmart } from "./Shared";
import { toast } from "@/components/ui/toast";

import { PageLoading } from "@/components/ui/Loading";
export function NewProduct() {
  const router = useRouter();
  const [meta, setMeta] = useState<{ item_groups: string[]; uoms: string[]; stock_status_options: string[] } | null>(null);
  const [f, setF] = useState({ name: "", group: "", unit: "Bao", price: "", stock: "", chem: false, pub: true });

  useEffect(() => {
    frappeCall<typeof meta>("cago.api.owner.get_product_meta", {}, { method: "GET" })
      .then(setMeta)
      .catch(() => {});
  }, []);
  if (!meta) return <PageLoading />;

  const create = async () => {
    if (!f.name.trim()) {
      toast.error("Nhập tên sản phẩm.");
      return;
    }
    if (!f.group) {
      toast.error("Chọn nhóm hàng.");
      return;
    }
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
      router.push(`/pos/products/${encodeURIComponent(r.item_code)}/edit`);
    } catch {
      toast.error("Lỗi: không tạo được sản phẩm.");
    }
  };

  return (
    <div className="mx-auto max-w-[760px] xl:max-w-[900px]">
      <BackBar onBack={() => goBackSmart(router)} title="THÊM SẢN PHẨM" />
      {/* 2-column on desktop (sm+) so the form uses the width instead of a narrow mobile strip;
          1-column on phones. Name + checkboxes + button span both columns. */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-2 rounded-xl bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block font-bold text-slate-700">Tên sản phẩm *</label>
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        </div>
        <div>
          <label className="block font-bold text-slate-700">Nhóm hàng *</label>
          <select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5">
            {["", ...meta.item_groups].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-bold text-slate-700">Đơn vị (Bao/Gói/Chai...) *</label>
          <input list="uoms" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <datalist id="uoms">
            {meta.uoms.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block font-bold text-slate-700">Giá bán (đồng)</label>
          <input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: groupVnd(e.target.value) })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        </div>
        <div>
          <label className="block font-bold text-slate-700">Tồn kho hiển thị</label>
          <select value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5">
            {["", ...meta.stock_status_options].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 font-bold text-slate-700">
            <input type="checkbox" checked={f.chem} onChange={(e) => setF({ ...f, chem: e.target.checked })} className="h-5 w-5" /> Là hóa chất/thuốc
          </label>
          <label className="flex items-center gap-2 font-bold text-slate-700">
            <input type="checkbox" checked={f.pub} onChange={(e) => setF({ ...f, pub: e.target.checked })} className="h-5 w-5" /> Hiển thị trên kiosk
          </label>
        </div>
        <button onClick={create} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white sm:col-span-2">
          Tạo sản phẩm
        </button>
      </div>
    </div>
  );
}
