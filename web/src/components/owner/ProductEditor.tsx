"use client";

import { useEffect, useState } from "react";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { frappeCall, uploadFile } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import type { Batch } from "@/lib/types";
import { BackBar, DraftModal, Ok, Warn } from "./OwnerShared";

interface EditData {
  cago_display_name?: string;
  selling_price?: number;
  cago_stock_status_manual?: string;
  stock_status_options?: string[];
  cago_product_quality_tier?: string;
  quality_options?: string[];
  item_name?: string;
  images?: { main?: string; images: string[] };
  [k: string]: unknown;
}

const EDIT_FIELDS = [
  "cago_display_name",
  "selling_price",
  "cago_stock_status_manual",
  "cago_stock_auto",
  "cago_reorder_level",
  "cago_min_price",
  "cago_shelf_location",
  "cago_local_names",
  "cago_public_description",
  "cago_use_cases",
  "cago_crop_or_animal_targets",
  "cago_package_color",
  "cago_product_quality_tier",
  "cago_staff_advice",
  "cago_call_owner_when",
  "cago_safety_notes",
  "cago_is_chemical",
  "cago_is_public_visible",
] as const;

// These are defined at MODULE scope (not inside ProductEditor) so their component identity
// is stable across renders — otherwise React remounts each <input> on every keystroke and
// the field loses focus after one character (the owner couldn't type).
type FieldProps = { label: string; k: string; data: Record<string, string | number>; set: (k: string, v: string | number) => void };

function EditField({ label, k, data, set, type = "text" }: FieldProps & { type?: string }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block font-bold text-slate-700">{label}</span>
      <input
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        value={(data[k] as string) ?? ""}
        onChange={(ev) => set(k, ev.target.value)}
        className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base"
      />
    </label>
  );
}
function EditArea({ label, k, data, set }: FieldProps) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block font-bold text-slate-700">{label}</span>
      <textarea rows={2} value={(data[k] as string) ?? ""} onChange={(ev) => set(k, ev.target.value)} className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base" />
    </label>
  );
}
function EditSelect({ label, k, data, set, opts }: FieldProps & { opts: string[] }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block font-bold text-slate-700">{label}</span>
      <select value={(data[k] as string) ?? ""} onChange={(ev) => set(k, ev.target.value)} className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base">
        {["", ...opts].map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function EditCheck({ label, k, data, set }: FieldProps) {
  return (
    <label className="mt-3 flex items-center gap-2 font-bold text-slate-700">
      <input type="checkbox" checked={!!data[k]} onChange={(ev) => set(k, ev.target.checked ? 1 : 0)} className="h-5 w-5" />
      {label}
    </label>
  );
}

export function ProductEditor({ code }: { code: string }) {
  const router = useRouter();
  const [e, setE] = useState<EditData | null>(null);
  const [data, setData] = useState<Record<string, string | number>>({});
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [imgs, setImgs] = useState<{ main?: string; images: string[] }>({ images: [] });
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    frappeCall<EditData>("cago.api.owner.get_product_for_edit", { item_code: code }, { method: "GET" }).then((d) => {
      setE(d);
      setImgs(d.images || { images: [] });
      const init: Record<string, string | number> = {};
      EDIT_FIELDS.forEach((k) => (init[k] = ((d as Record<string, unknown>)[k] as string | number) ?? ""));
      init["barcode"] = (d as Record<string, unknown>)["barcode"] as string ?? ""; // Item Barcode child
      setData(init);
    });
  }, [code]);

  if (!e) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  const set = (k: string, v: string | number) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setMsg(null);
    if (saving) return;
    setSaving(true);
    try {
      await frappeCall("cago.api.owner.update_product", { item_code: code, data: JSON.stringify(data) });
      setMsg(<Ok>✅ Đã lưu sản phẩm.</Ok>);
    } catch (err) {
      setMsg(<Warn>Lỗi: {err instanceof Error ? err.message : "không lưu được."}</Warn>);
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setMsg(null);
    let last = imgs;
    for (const f of Array.from(files)) {
      // Phone photos are often several MB; on a rural connection that hangs. Reject early with a
      // clear message instead of a long silent wait that ends in a generic error.
      if (!f.type.startsWith("image/")) {
        setMsg(<Warn>“{f.name}” không phải ảnh.</Warn>);
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        setMsg(<Warn>Ảnh “{f.name}” quá lớn (tối đa 8MB). Chụp nhỏ lại hoặc chọn ảnh khác.</Warn>);
        continue;
      }
      try {
        const url = await uploadFile(f);
        last = await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.add_product_image", { item_code: code, image_url: url });
        setImgs(last); // commit each success so a later failure doesn't discard earlier uploads
      } catch {
        setMsg(<Warn>Tải ảnh “{f.name}” lỗi, thử lại.</Warn>);
      }
    }
  };

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} label="Quay lại" />
      <div className="rounded-xl bg-white p-4">
        <h2 className="text-xl font-bold">Sửa: {e.cago_display_name || e.item_name}</h2>

        <div className="mt-3 font-extrabold">Ảnh sản phẩm</div>
        {imgs.main ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgs.main} alt="" className="max-h-56 w-full rounded-lg bg-slate-100 object-contain" />
        ) : (
          <div className="rounded-lg bg-slate-100 p-5 text-center text-slate-500">Chưa có ảnh — bấm &quot;Tải ảnh lên&quot;</div>
        )}
        <label className="mt-2 flex min-h-touch cursor-pointer items-center justify-center rounded-xl bg-teal-600 font-extrabold text-white">
          <input type="file" accept="image/*" multiple className="hidden" onChange={(ev) => onUpload(ev.target.files)} />
          📷 Tải ảnh lên
        </label>
        {imgs.images.map((u) => (
          <div key={u} className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-14 w-14 rounded-lg object-cover" />
            <div className="flex-1">
              {u === imgs.main ? (
                <b className="text-brand">★ Ảnh chính</b>
              ) : (
                <button
                  onClick={async () => setImgs(await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.set_main_image", { item_code: code, image_url: u }))}
                  className="rounded bg-slate-200 px-2 py-1 text-sm font-bold"
                >
                  Đặt ảnh chính
                </button>
              )}
            </div>
            <button
              onClick={async () => {
                if (await confirmDialog("Xoá ảnh này?", { danger: true, confirmLabel: "Xoá" })) setImgs(await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.remove_product_image", { item_code: code, image_url: u }));
              }}
              className="rounded bg-red-100 px-2 py-1 text-sm font-bold text-red-700"
            >
              Xoá
            </button>
          </div>
        ))}

        <div className="mt-4 text-lg font-extrabold">Thông tin sản phẩm</div>
        <EditField label="Tên hiển thị" k="cago_display_name" data={data} set={set} />
        <EditField label="Mã vạch (barcode — quét/nhập)" k="barcode" data={data} set={set} />
        <EditField label="Giá bán (đồng)" k="selling_price" type="number" data={data} set={set} />
        <EditSelect label="Tồn kho hiển thị (khi không tự tính)" k="cago_stock_status_manual" opts={e.stock_status_options || []} data={data} set={set} />
        <EditCheck label="Tự tính tồn theo số thật (đã nhập hàng)" k="cago_stock_auto" data={data} set={set} />
        <EditField label="Mức đặt lại — 'còn ít' khi tồn ≤ (theo đơn vị tồn)" k="cago_reorder_level" type="number" data={data} set={set} />
        <EditField label="Giá bán tối thiểu (sàn) — chặn bán dưới giá vốn (để trống = không chặn)" k="cago_min_price" type="number" data={data} set={set} />
        <EditField label="Vị trí để hàng" k="cago_shelf_location" data={data} set={set} />
        <EditField label="Tên dân dã (khách hay gọi)" k="cago_local_names" data={data} set={set} />
        <EditArea label="Mô tả ngắn cho khách" k="cago_public_description" data={data} set={set} />
        <EditField label="Dùng cho" k="cago_use_cases" data={data} set={set} />
        <EditField label="Cây/con phù hợp" k="cago_crop_or_animal_targets" data={data} set={set} />
        <EditField label="Màu bao bì" k="cago_package_color" data={data} set={set} />
        <EditSelect label="Mức chất lượng" k="cago_product_quality_tier" opts={e.quality_options || []} data={data} set={set} />
        <EditArea label="Câu tư vấn cho người bán" k="cago_staff_advice" data={data} set={set} />
        <EditArea label="Khi nào cần gọi chủ" k="cago_call_owner_when" data={data} set={set} />
        <EditArea label="Lưu ý an toàn" k="cago_safety_notes" data={data} set={set} />
        <EditCheck label="Là hóa chất/thuốc" k="cago_is_chemical" data={data} set={set} />
        <EditCheck label="Hiển thị trên kiosk" k="cago_is_public_visible" data={data} set={set} />

        <button onClick={save} disabled={saving} className="mt-4 min-h-touch w-full rounded-xl bg-amber-500 font-extrabold text-white disabled:opacity-50">
          {saving ? "Đang lưu..." : "💾 Lưu sản phẩm"}
        </button>
        <button
          onClick={async () => {
            const r = await frappeCall<{ text: string }>("cago.api.owner.zalo_draft", { kind: "restock", item_code: code });
            setDraft(r.text);
          }}
          className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white"
        >
          📩 Soạn tin báo hàng về
        </button>
        {msg}

        <WholesalePrice code={code} />
        <StockSection code={code} />
        <UnitsSection code={code} />
        <BatchSection code={code} />
        <PriceHistory code={code} />
      </div>
      {draft !== null && <DraftModal text={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

function StockSection({ code }: { code: string }) {
  type Stock = { qty: number; uom: string; has_batch: boolean; batches: { batch_id: string; expiry_date?: string }[] };
  const [stock, setStock] = useState<Stock | null>(null);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const load = async () => setStock(await frappeCall<Stock>("cago.api.purchasing.get_stock", { item_code: code }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const receive = async () => {
    setMsg(null);
    if (busy) return;
    const n = parseFloat(qty);
    if (!n || n <= 0) return setMsg(<Warn>Nhập số lượng nhập.</Warn>);
    if (stock?.has_batch && !batchNo) return setMsg(<Warn>Sản phẩm theo lô — chọn lô (thêm lô ở mục Lô &amp; hạn dùng bên dưới).</Warn>);
    setBusy(true);
    try {
      const r = await frappeCall<{ qty: number }>("cago.api.purchasing.receive_stock", {
        item_code: code,
        qty: n,
        cost_rate: cost ? parseVnd(cost) : null,
        batch_no: stock?.has_batch ? batchNo : null,
      });
      setStock((s) => (s ? { ...s, qty: r.qty } : s));
      setQty("");
      setCost("");
      setMsg(<Ok>✅ Đã nhập hàng. Tồn hiện tại: {r.qty}</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi nhập hàng."}</Warn>);
    } finally {
      setBusy(false);
    }
  };

  const adjust = async () => {
    setMsg(null);
    if (busy) return;
    const n = parseFloat(counted);
    if (counted === "" || isNaN(n) || n < 0) return setMsg(<Warn>Nhập số đếm thực tế (≥ 0).</Warn>);
    if (!(await confirmDialog(`Đặt tồn thực tế = ${n} ${stock?.uom || ""}? (dùng khi kiểm kê, lệch do hao hụt/vỡ)`, { confirmLabel: "Đặt tồn" }))) return;
    setBusy(true);
    try {
      const r = await frappeCall<{ before: number; qty: number }>("cago.api.purchasing.adjust_stock", { item_code: code, counted_qty: n });
      setStock((s) => (s ? { ...s, qty: r.qty } : s));
      setCounted("");
      setMsg(<Ok>✅ Đã kiểm kê: {r.before} → {r.qty} {stock?.uom}.</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi kiểm kê."}</Warn>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-slate-200 pt-3">
      <div className="text-lg font-extrabold">Tồn kho &amp; nhập hàng</div>
      <div className="mt-1 text-slate-600">
        Tồn thật hiện tại: <b className="text-brand-dark">{stock ? `${stock.qty} ${stock.uom}` : "…"}</b>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder={`Số lượng nhập (${stock?.uom || ""})`} className="rounded-lg border-2 border-emerald-300 p-2.5" />
        <input value={cost} onChange={(e) => setCost(groupVnd(e.target.value))} inputMode="numeric" placeholder="Giá nhập / đơn vị (tùy chọn)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
      </div>
      {stock?.has_batch && (
        <select value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className="mt-2 w-full rounded-lg border-2 border-emerald-300 p-2.5">
          <option value="">— Chọn lô —</option>
          {stock.batches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.batch_id}
              {b.expiry_date ? ` (HSD ${b.expiry_date})` : ""}
            </option>
          ))}
        </select>
      )}
      <button onClick={receive} disabled={busy} className="mt-2 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white disabled:opacity-50">
        📥 Nhập hàng (tăng tồn thật)
      </button>

      <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
        <div className="font-bold text-slate-700">Kiểm kê (sửa tồn về số đếm thực tế)</div>
        <div className="mt-1 flex gap-2">
          <input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder={`Đếm được (${stock?.uom || ""})`} className="flex-1 rounded-lg border-2 border-amber-300 p-2.5" />
          <button onClick={adjust} disabled={busy} className="rounded-lg bg-amber-500 px-4 font-extrabold text-white disabled:opacity-50">
            Cập nhật
          </button>
        </div>
      </div>
      {msg}
    </div>
  );
}

function UnitsSection({ code }: { code: string }) {
  type U = { uom: string; label?: string; is_stock?: number; units_per_stock?: number; conversion_factor?: number; price_text: string };
  type Data = { stock_uom: string; units: U[]; show_retail: boolean; presets: { uom: string; hint: string }[] };
  const [d, setD] = useState<Data | null>(null);
  const [uom, setUom] = useState("");
  const [ups, setUps] = useState("");
  const [price, setPrice] = useState("");
  // Direction of the conversion the owner types:
  //  - "perStock": 1 [đơn vị tồn] = N [đơn vị bán]  (đơn vị NHỎ hơn, vd 1 Bao = 25 Kg)
  //  - "perUnit":  1 [đơn vị bán] = N [đơn vị tồn]  (đơn vị LỚN hơn, vd 1 Yến = 10 Kg)
  const [dir, setDir] = useState<"perStock" | "perUnit">("perStock");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const load = async () => setD(await frappeCall<Data>("cago.api.units.get_units", { item_code: code }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  if (!d) return null;

  // Bigger Vietnamese weight units, shown in Vietnamese but STORED as neutral math-style codes
  // (base kg + factor) so the data layer never carries Vietnamese strings. 1 [unit] = N [stock].
  const WEIGHT = [
    { code: "kg10", label: "Yến", n: 10 },
    { code: "kg100", label: "Tạ", n: 100 },
    { code: "kg1000", label: "Tấn", n: 1000 },
  ];
  const weightOf = (c: string) => WEIGHT.find((w) => w.code === c);
  const pickWeight = (w: { code: string; n: number }) => {
    setUom(w.code);
    setDir("perUnit");
    setUps(String(w.n));
  };

  const add = async () => {
    setMsg(null);
    if (!uom.trim()) return setMsg(<Warn>Chọn hoặc nhập đơn vị.</Warn>);
    const n = parseFloat(ups);
    if (!n || n <= 0) return setMsg(<Warn>Nhập số quy đổi (lớn hơn 0).</Warn>);
    // Backend wants units_per_stock = how many [sale unit] in 1 [stock unit].
    const upsVal = dir === "perStock" ? n : 1 / n;
    const p = parseVnd(price);
    if (!p || p <= 0) return setMsg(<Warn>Nhập giá bán cho đơn vị này.</Warn>);
    try {
      setD(await frappeCall<Data>("cago.api.units.save_unit", { item_code: code, uom: uom.trim(), units_per_stock: upsVal, price: p }));
      setUom("");
      setUps("");
      setPrice("");
      setDir("perStock");
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi lưu đơn vị."}</Warn>);
    }
  };
  const remove = async (u: string, label?: string) => {
    if (await confirmDialog(`Xoá đơn vị bán ${label || u}?`, { danger: true, confirmLabel: "Xoá" })) setD(await frappeCall<Data>("cago.api.units.remove_unit", { item_code: code, uom: u }));
  };
  const toggle = async () => {
    await frappeCall("cago.api.units.set_retail_visible", { item_code: code, visible: d.show_retail ? 0 : 1 });
    setD({ ...d, show_retail: !d.show_retail });
  };

  return (
    <div className="mt-5 border-t border-slate-200 pt-3">
      <div className="text-lg font-extrabold">Đơn vị bán &amp; giá lẻ</div>
      <p className="text-sm text-slate-500">
        Tồn kho theo <b>{d.stock_uom}</b>. Thêm đơn vị lẻ (kg, lạng…) với giá riêng — ERPNext tự quy đổi tồn khi bán lẻ.
      </p>
      {d.units.map((u) => (
        <div key={u.uom} className="mt-1.5 flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2">
          <span>
            <b>{u.label || u.uom}</b>{" "}
            {u.is_stock ? (
              "(tồn kho)"
            ) : (u.conversion_factor ?? 0) > 1 ? (
              // Bigger unit (yến/tạ/tấn): 1 Yến = 10 Kg
              <span className="text-slate-500">· 1 {u.label || u.uom} = {u.conversion_factor} {d.stock_uom}</span>
            ) : u.units_per_stock ? (
              // Smaller retail unit: 1 Bao = 25 Kg
              <span className="text-slate-500">· 1 {d.stock_uom} = {u.units_per_stock} {u.label || u.uom}</span>
            ) : (
              ""
            )}
          </span>
          <span className="flex items-center gap-2">
            <b className="text-brand">{u.price_text}</b>
            {!u.is_stock && (
              <button onClick={() => remove(u.uom, u.label)} className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                Xoá
              </button>
            )}
          </span>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        {d.presets.map((p) => (
          <button key={p.uom} onClick={() => { setUom(p.uom); setDir("perStock"); }} className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm font-bold text-brand-dark" title={p.hint}>
            {p.uom}
          </button>
        ))}
        {WEIGHT.map((w) => (
          <button key={w.code} onClick={() => pickWeight(w)} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800" title={`1 ${w.label} = ${w.n} ${d.stock_uom}`}>
            {w.label} <span className="font-normal">(={w.n} {d.stock_uom})</span>
          </button>
        ))}
      </div>
      {weightOf(uom) ? (
        // A bigger weight unit (Yến/Tạ/Tấn) was picked — code is fixed, owner only enters the price.
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800">
            {weightOf(uom)!.label} = {weightOf(uom)!.n} {d.stock_uom}
            <button onClick={() => { setUom(""); setUps(""); setDir("perStock"); }} className="text-amber-700" aria-label="Bỏ chọn">✕</button>
          </span>
          <input value={price} onChange={(e) => setPrice(groupVnd(e.target.value))} inputMode="numeric" placeholder={`Giá / ${weightOf(uom)!.label} (đồng)`} className="min-w-0 flex-1 rounded-lg border-2 border-emerald-300 p-2.5" />
        </div>
      ) : (
        <>
          {/* Direction toggle — let the owner type the conversion the natural way for either size. */}
          <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm font-bold">
            <button onClick={() => setDir("perStock")} className={dir === "perStock" ? "bg-brand px-3 py-1.5 text-white" : "bg-white px-3 py-1.5 text-slate-600"}>
              Đơn vị nhỏ hơn
            </button>
            <button onClick={() => setDir("perUnit")} className={dir === "perUnit" ? "bg-brand px-3 py-1.5 text-white" : "bg-white px-3 py-1.5 text-slate-600"}>
              Đơn vị lớn hơn
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="Đơn vị (vd Kg, Lạng)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
            <input
              value={ups}
              onChange={(e) => setUps(e.target.value)}
              inputMode="numeric"
              placeholder={dir === "perStock" ? `1 ${d.stock_uom} = ? ${uom || "đơn vị"}` : `1 ${uom || "đơn vị"} = ? ${d.stock_uom}`}
              className="rounded-lg border-2 border-emerald-300 p-2.5"
            />
            <input value={price} onChange={(e) => setPrice(groupVnd(e.target.value))} inputMode="numeric" placeholder="Giá / đơn vị (đồng)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {dir === "perStock"
              ? `Đơn vị bán nhỏ hơn đơn vị tồn — vd 1 ${d.stock_uom} = 25 Kg.`
              : `Đơn vị bán lớn hơn đơn vị tồn — vd 1 Yến = 10 ${d.stock_uom}.`}
          </p>
        </>
      )}
      <button onClick={add} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
        + Lưu đơn vị bán
      </button>
      <label className="mt-3 flex items-center gap-2 font-bold text-slate-700">
        <input type="checkbox" checked={d.show_retail} onChange={toggle} className="h-5 w-5" /> Hiện giá bán lẻ cho khách trên kiosk
      </label>
      {msg}
    </div>
  );
}

function BatchSection({ code }: { code: string }) {
  const [rows, setRows] = useState<Batch[]>([]);
  const [bid, setBid] = useState("");
  const [exp, setExp] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const load = async () => setRows(await frappeCall<Batch[]>("cago.api.inventory.list_batches", { item_code: code }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const add = async () => {
    setMsg(null);
    if (!bid.trim()) {
      setMsg(<Warn>Nhập mã lô.</Warn>);
      return;
    }
    try {
      await frappeCall("cago.api.inventory.add_batch", { item_code: code, batch_id: bid.trim(), expiry_date: exp || null });
      setBid("");
      setExp("");
      await load();
    } catch (err) {
      setMsg(<Warn>{err instanceof Error ? err.message : "Lỗi thêm lô."}</Warn>);
    }
  };

  return (
    <div className="mt-5 border-t border-slate-200 pt-3">
      <div className="text-lg font-extrabold">Lô hàng &amp; hạn sử dụng</div>
      {rows.map((b) => (
        <div key={b.batch} className="mt-1.5 flex justify-between rounded-lg border border-slate-200 px-2.5 py-2">
          <span>
            <b>{b.batch_id}</b>
            {b.expiry_text ? <span className="text-slate-500"> · HSD {b.expiry_text}</span> : ""}
            {b.sell_first ? <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700">→ bán trước</span> : ""}
          </span>
          <span
            className={
              b.expiry_status === "expired"
                ? "font-bold text-red-600"
                : b.expiry_status === "near"
                  ? "font-bold text-amber-600"
                  : "text-slate-400"
            }
          >
            {b.expiry_status === "expired" ? "Hết hạn" : b.expiry_status === "near" ? "Sắp hết hạn" : "Còn hạn"}
          </span>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={bid} onChange={(e) => setBid(e.target.value)} placeholder="Mã lô (vd L240501)" className="min-w-[120px] flex-1 rounded-lg border-2 border-emerald-300 p-2.5" />
        <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} className="rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={add} className="rounded-lg bg-brand px-4 font-extrabold text-white">
          + Thêm lô
        </button>
      </div>
      {msg}
    </div>
  );
}

function WholesalePrice({ code }: { code: string }) {
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  useEffect(() => {
    frappeCall<{ wholesale_price: number | null }>("cago.api.owner.get_wholesale_price", { item_code: code }, { method: "GET" })
      .then((r) => setPrice(r.wholesale_price ? groupVnd(String(r.wholesale_price)) : ""))
      .catch(() => {});
  }, [code]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await frappeCall("cago.api.owner.set_wholesale_price", { item_code: code, price: price ? parseVnd(price) : 0 });
      setMsg(<Ok>✅ Đã lưu giá sỉ.</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi lưu giá sỉ."}</Warn>);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 border-t border-slate-200 pt-3">
      <div className="text-lg font-extrabold">Giá sỉ (cho khách sỉ)</div>
      <div className="text-sm text-slate-500">Khách được đánh dấu &quot;khách sỉ&quot; sẽ mua theo giá này. Để trống = không có giá sỉ.</div>
      <div className="mt-2 flex gap-2">
        <input value={price} onChange={(e) => setPrice(groupVnd(e.target.value))} inputMode="numeric" placeholder="Giá sỉ / đơn vị tồn" className="flex-1 rounded-lg border-2 border-violet-300 p-2.5" />
        <button onClick={save} disabled={busy} className="rounded-lg bg-violet-600 px-4 font-extrabold text-white disabled:opacity-50">
          Lưu
        </button>
      </div>
      {msg}
    </div>
  );
}

function PriceHistory({ code }: { code: string }) {
  type Row = { when: string; old_text: string; new_text: string; up: boolean; by: string };
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    frappeCall<Row[]>("cago.api.owner.price_history", { item_code: code }, { method: "GET" }).then(setRows).catch(() => setRows([]));
  }, [code]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="mt-5 border-t border-slate-200 pt-3">
      <div className="text-lg font-extrabold">Lịch sử giá</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2">
          <span className="text-slate-500">{r.when}</span>
          <span className="font-bold">
            {r.old_text} → <span className={r.up ? "text-red-600" : "text-brand"}>{r.new_text}</span> {r.up ? "↑" : "↓"}
          </span>
        </div>
      ))}
    </div>
  );
}
