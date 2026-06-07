"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, uploadFile } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import { uomLabel } from "@/lib/uom";
import { BackBar, goBackSmart } from "./Shared";
import { ProductPhotos } from "./ProductPhotos";
import { toast } from "@/components/ui/toast";

import { PageLoading } from "@/components/ui/Loading";

type Pick = { file: File; url: string };

export function NewProduct() {
  const router = useRouter();
  const [meta, setMeta] = useState<{ item_groups: string[]; uoms: string[]; stock_status_options: string[] } | null>(null);
  // unitOther = the owner is typing a brand-new unit (not in the list yet); stockAuto = let the
  // system show stock from the real on-hand qty (default) instead of a manually-picked status.
  const [f, setF] = useState({ name: "", group: "", unit: "Bao", unitOther: false, price: "", stock: "", stockAuto: true, chem: false, pub: true, batch: false });
  // Photos picked before the product exists: hold the File + a local preview URL, then upload them
  // right after create_product returns an item_code (the first one becomes the main image).
  const [pics, setPics] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const picsRef = useRef<Pick[]>([]);
  picsRef.current = pics;

  useEffect(() => {
    frappeCall<typeof meta>("cago.api.owner.get_product_meta", {}, { method: "GET" })
      .then(setMeta)
      .catch(() => {});
  }, []);
  // Release preview object URLs on unmount only (via ref, so adding a photo doesn't revoke the
  // ones still on screen) — picked photos otherwise leak memory.
  useEffect(() => () => picsRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  if (!meta) return <PageLoading />;

  const addPics = (files: FileList | null) => {
    if (!files) return;
    const next: Pick[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { toast.error(`“${file.name}” không phải ảnh.`); continue; }
      if (file.size > 8 * 1024 * 1024) { toast.error(`Ảnh “${file.name}” quá lớn (tối đa 8MB).`); continue; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    if (next.length) setPics((cur) => [...cur, ...next]);
  };
  const removePic = (url: string) => {
    URL.revokeObjectURL(url);
    setPics((cur) => cur.filter((p) => p.url !== url));
  };
  // Make a photo the main one by moving it to the front — photos upload in order and the first
  // becomes the main image (matches the edit screen's "★ Ảnh chính").
  const setMainPic = (url: string) =>
    setPics((cur) => {
      const pic = cur.find((p) => p.url === url);
      return pic ? [pic, ...cur.filter((p) => p.url !== url)] : cur;
    });

  const create = async () => {
    if (!f.name.trim()) {
      toast.error("Nhập tên sản phẩm.");
      return;
    }
    if (!f.group) {
      toast.error("Chọn nhóm hàng.");
      return;
    }
    if (!f.unit.trim()) {
      toast.error("Chọn hoặc nhập đơn vị.");
      return;
    }
    setBusy(true);
    try {
      const r = await frappeCall<{ item_code: string }>("cago.api.owner.create_product", {
        data: JSON.stringify({
          cago_display_name: f.name.trim(),
          item_group: f.group,
          stock_uom: f.unit.trim(),
          // Strip grouping so "150.000" → 150000, not flt("150.000")=150 server-side.
          selling_price: parseVnd(f.price),
          // Auto stock = show status from real on-hand qty; only send a manual status when off.
          cago_stock_auto: f.stockAuto ? 1 : 0,
          cago_stock_status_manual: f.stockAuto ? "" : f.stock,
          cago_is_chemical: f.chem ? 1 : 0,
          cago_is_public_visible: f.pub ? 1 : 0,
          cago_has_batch: f.batch ? 1 : 0,
        }),
      });
      // Upload the picked photos against the new item; first becomes the main image. A photo that
      // fails to upload is reported but doesn't block creation (the owner can re-add it on edit).
      let imgFail = 0;
      for (const p of pics) {
        try {
          const url = await uploadFile(p.file);
          await frappeCall("cago.api.owner.add_product_image", { item_code: r.item_code, image_url: url });
        } catch {
          imgFail++;
        }
      }
      if (imgFail) toast.error(`${imgFail} ảnh chưa tải lên được — thêm lại ở bước sau.`);
      router.push(`/pos/products/${encodeURIComponent(r.item_code)}/edit`);
    } catch {
      toast.error("Lỗi: không tạo được sản phẩm.");
      setBusy(false);
    }
  };

  // Existing units to pick from; keep the current value selectable even if it isn't in the list yet.
  const unitOptions = Array.from(new Set([...(!f.unitOther && f.unit ? [f.unit] : []), ...meta.uoms]));

  return (
    <div className="">
      <BackBar onBack={() => goBackSmart(router)} title="➕ Thêm sản phẩm" />
      {/* 2-column on desktop (sm+) so the form uses the width instead of a narrow mobile strip;
          1-column on phones. Name + checkboxes + button span both columns. */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-2 rounded-xl bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block font-bold text-slate-700">Tên sản phẩm *</label>
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        </div>
        {/* Photo first: the kiosk and staff search lean on product images, and the owner has the
            item in hand right now — capturing it here means it won't be left blank. Same shared
            ProductPhotos block as the edit screen, so the two feel identical. */}
        <div className="sm:col-span-2">
          <label className="mb-1 block font-bold text-slate-700">🖼 Ảnh sản phẩm</label>
          <ProductPhotos
            photos={pics.map((p, i) => ({ url: p.url, main: i === 0 }))}
            onPick={addPics}
            onSetMain={setMainPic}
            onRemove={removePic}
          />
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
          {/* Pick from existing units (a new one typed below is auto-saved and appears here next
              time); "➕ Đơn vị khác…" reveals a field to add one that doesn't exist yet. */}
          <select
            value={f.unitOther ? "__other__" : f.unit}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") setF({ ...f, unitOther: true, unit: "" });
              else setF({ ...f, unitOther: false, unit: v });
            }}
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          >
            {unitOptions.map((u) => (
              <option key={u} value={u}>{uomLabel(u)}</option>
            ))}
            <option value="__other__">➕ Đơn vị khác…</option>
          </select>
          {f.unitOther && (
            <input
              autoFocus
              value={f.unit}
              onChange={(e) => setF({ ...f, unit: e.target.value })}
              placeholder="Nhập đơn vị mới (vd Bao, Gói, Chai, Lọ...)"
              className="mt-2 w-full rounded-lg border-2 border-emerald-300 p-2.5"
            />
          )}
        </div>
        <div>
          <label className="block font-bold text-slate-700">Giá bán (đồng)</label>
          <input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: groupVnd(e.target.value) })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        </div>
        <div>
          <label className="block font-bold text-slate-700">Tồn kho hiển thị</label>
          {/* Default: auto from real on-hand qty. Turn off to pin a manual status instead. */}
          <label className="mt-1 flex items-center gap-2 font-semibold text-slate-700">
            <input type="checkbox" checked={f.stockAuto} onChange={(e) => setF({ ...f, stockAuto: e.target.checked })} className="h-5 w-5" />
            Tự động theo tồn thực (khi đã nhập hàng)
          </label>
          {!f.stockAuto && (
            <>
              <select value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="mt-2 w-full rounded-lg border-2 border-emerald-300 p-2.5">
                {["", ...meta.stock_status_options].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <p className="mt-1 text-sm text-slate-400">Hàng không cần đếm số lượng (dây, đinh, dịch vụ, hàng luôn có…) → để trống, hệ thống hiện <b>“Còn hàng”</b>.</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          {/* Ticking "hóa chất/thuốc" suggests lot tracking too (those goods have HSD), but the
              owner can still toggle each independently. */}
          <label className="flex items-center gap-2 font-bold text-slate-700">
            <input type="checkbox" checked={f.chem} onChange={(e) => setF({ ...f, chem: e.target.checked, batch: e.target.checked ? true : f.batch })} className="h-5 w-5" /> Là hóa chất/thuốc
          </label>
          <label className="flex items-center gap-2 font-bold text-slate-700">
            <input type="checkbox" checked={f.pub} onChange={(e) => setF({ ...f, pub: e.target.checked })} className="h-5 w-5" /> Hiển thị trên kiosk
          </label>
        </div>
        {/* Opt-in lot/expiry tracking — only goods that expire need it (matches KiotViet/Sapo). */}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 font-bold text-slate-700">
            <input type="checkbox" checked={f.batch} onChange={(e) => setF({ ...f, batch: e.target.checked })} className="h-5 w-5" /> 📦 Quản lý theo lô / hạn dùng
          </label>
          <p className="ml-7 text-sm text-slate-400">Nên bật cho thuốc / hóa chất / cám có hạn — mỗi lần nhập là một lô riêng, nhập kèm hạn dùng để cảnh báo & bán lô gần hết hạn trước.</p>
        </div>
        <button onClick={create} disabled={busy} className="mt-2 min-h-touch w-full rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-50 sm:col-span-2">
          {busy ? "Đang tạo..." : "Tạo sản phẩm"}
        </button>
        <p className="text-center text-sm text-slate-400 sm:col-span-2">
          Tạo xong sẽ mở trang sửa để thêm mã vạch, vị trí kệ, tư vấn, giá nhiều đơn vị...
        </p>
      </div>
    </div>
  );
}
