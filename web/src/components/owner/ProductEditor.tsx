"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, uploadFile } from "@/lib/api";
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

export function ProductEditor({ code }: { code: string }) {
  const router = useRouter();
  const [e, setE] = useState<EditData | null>(null);
  const [data, setData] = useState<Record<string, string | number>>({});
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [imgs, setImgs] = useState<{ main?: string; images: string[] }>({ images: [] });
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    frappeCall<EditData>("cago.api.owner.get_product_for_edit", { item_code: code }, { method: "GET" }).then((d) => {
      setE(d);
      setImgs(d.images || { images: [] });
      const init: Record<string, string | number> = {};
      EDIT_FIELDS.forEach((k) => (init[k] = ((d as Record<string, unknown>)[k] as string | number) ?? ""));
      setData(init);
    });
  }, [code]);

  if (!e) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  const set = (k: string, v: string | number) => setData((d) => ({ ...d, [k]: v }));
  const Field = ({ label, k, type = "text" }: { label: string; k: string; type?: string }) => (
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
  const Area = ({ label, k }: { label: string; k: string }) => (
    <label className="mt-3 block">
      <span className="mb-1 block font-bold text-slate-700">{label}</span>
      <textarea rows={2} value={(data[k] as string) ?? ""} onChange={(ev) => set(k, ev.target.value)} className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base" />
    </label>
  );
  const Select = ({ label, k, opts }: { label: string; k: string; opts: string[] }) => (
    <label className="mt-3 block">
      <span className="mb-1 block font-bold text-slate-700">{label}</span>
      <select value={(data[k] as string) ?? ""} onChange={(ev) => set(k, ev.target.value)} className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base">
        {["", ...opts].map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  const Check = ({ label, k }: { label: string; k: string }) => (
    <label className="mt-3 flex items-center gap-2 font-bold text-slate-700">
      <input type="checkbox" checked={!!data[k]} onChange={(ev) => set(k, ev.target.checked ? 1 : 0)} className="h-5 w-5" />
      {label}
    </label>
  );

  const save = async () => {
    setMsg(null);
    try {
      await frappeCall("cago.api.owner.update_product", { item_code: code, data: JSON.stringify(data) });
      setMsg(<Ok>✅ Đã lưu sản phẩm.</Ok>);
    } catch {
      setMsg(<Warn>Lỗi: không lưu được.</Warn>);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    let last = imgs;
    for (const f of Array.from(files)) {
      try {
        const url = await uploadFile(f);
        last = await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.add_product_image", { item_code: code, image_url: url });
      } catch {
        setMsg(<Warn>Tải ảnh lỗi, thử lại.</Warn>);
        return;
      }
    }
    setImgs(last);
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
                if (confirm("Xoá ảnh này?")) setImgs(await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.remove_product_image", { item_code: code, image_url: u }));
              }}
              className="rounded bg-red-100 px-2 py-1 text-sm font-bold text-red-700"
            >
              Xoá
            </button>
          </div>
        ))}

        <div className="mt-4 text-lg font-extrabold">Thông tin sản phẩm</div>
        <Field label="Tên hiển thị" k="cago_display_name" />
        <Field label="Giá bán (đồng)" k="selling_price" type="number" />
        <Select label="Tồn kho hiển thị (khi không tự tính)" k="cago_stock_status_manual" opts={e.stock_status_options || []} />
        <Check label="Tự tính tồn theo số thật (đã nhập hàng)" k="cago_stock_auto" />
        <Field label="Mức đặt lại — 'còn ít' khi tồn ≤ (theo đơn vị tồn)" k="cago_reorder_level" type="number" />
        <Field label="Vị trí để hàng" k="cago_shelf_location" />
        <Field label="Tên dân dã (khách hay gọi)" k="cago_local_names" />
        <Area label="Mô tả ngắn cho khách" k="cago_public_description" />
        <Field label="Dùng cho" k="cago_use_cases" />
        <Field label="Cây/con phù hợp" k="cago_crop_or_animal_targets" />
        <Field label="Màu bao bì" k="cago_package_color" />
        <Select label="Mức chất lượng" k="cago_product_quality_tier" opts={e.quality_options || []} />
        <Area label="Câu tư vấn cho người bán" k="cago_staff_advice" />
        <Area label="Khi nào cần gọi chủ" k="cago_call_owner_when" />
        <Area label="Lưu ý an toàn" k="cago_safety_notes" />
        <Check label="Là hóa chất/thuốc" k="cago_is_chemical" />
        <Check label="Hiển thị trên kiosk" k="cago_is_public_visible" />

        <button onClick={save} className="mt-4 min-h-touch w-full rounded-xl bg-amber-500 font-extrabold text-white">
          💾 Lưu sản phẩm
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

        <StockSection code={code} />
        <UnitsSection code={code} />
        <BatchSection code={code} />
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
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const load = async () => setStock(await frappeCall<Stock>("cago.api.purchasing.get_stock", { item_code: code }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const receive = async () => {
    setMsg(null);
    const n = parseFloat(qty);
    if (!n || n <= 0) return setMsg(<Warn>Nhập số lượng nhập.</Warn>);
    if (stock?.has_batch && !batchNo) return setMsg(<Warn>Sản phẩm theo lô — chọn lô (thêm lô ở mục Lô &amp; hạn dùng bên dưới).</Warn>);
    try {
      const r = await frappeCall<{ qty: number }>("cago.api.purchasing.receive_stock", {
        item_code: code,
        qty: n,
        cost_rate: cost ? parseFloat(cost) : null,
        batch_no: stock?.has_batch ? batchNo : null,
      });
      setStock((s) => (s ? { ...s, qty: r.qty } : s));
      setQty("");
      setCost("");
      setMsg(<Ok>✅ Đã nhập hàng. Tồn hiện tại: {r.qty}</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi nhập hàng."}</Warn>);
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
        <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" placeholder="Giá nhập / đơn vị (tùy chọn)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
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
      <button onClick={receive} className="mt-2 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white">
        📥 Nhập hàng (tăng tồn thật)
      </button>
      {msg}
    </div>
  );
}

function UnitsSection({ code }: { code: string }) {
  type U = { uom: string; is_stock?: number; units_per_stock?: number; price_text: string };
  type Data = { stock_uom: string; units: U[]; show_retail: boolean; presets: { uom: string; hint: string }[] };
  const [d, setD] = useState<Data | null>(null);
  const [uom, setUom] = useState("");
  const [ups, setUps] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const load = async () => setD(await frappeCall<Data>("cago.api.units.get_units", { item_code: code }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  if (!d) return null;

  const add = async () => {
    setMsg(null);
    if (!uom.trim()) return setMsg(<Warn>Chọn hoặc nhập đơn vị.</Warn>);
    const n = parseFloat(ups);
    if (!n || n <= 0) return setMsg(<Warn>{`Nhập số ${uom || "đơn vị"} trong 1 ${d.stock_uom}.`}</Warn>);
    const p = parseFloat(price);
    if (!p || p <= 0) return setMsg(<Warn>Nhập giá bán cho đơn vị này.</Warn>);
    try {
      setD(await frappeCall<Data>("cago.api.units.save_unit", { item_code: code, uom: uom.trim(), units_per_stock: n, price: p }));
      setUom("");
      setUps("");
      setPrice("");
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi lưu đơn vị."}</Warn>);
    }
  };
  const remove = async (u: string) => {
    if (confirm(`Xoá đơn vị bán ${u}?`)) setD(await frappeCall<Data>("cago.api.units.remove_unit", { item_code: code, uom: u }));
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
            <b>{u.uom}</b>{" "}
            {u.is_stock ? "(tồn kho)" : u.units_per_stock ? <span className="text-slate-500">· 1 {d.stock_uom} = {u.units_per_stock} {u.uom}</span> : ""}
          </span>
          <span className="flex items-center gap-2">
            <b className="text-brand">{u.price_text}</b>
            {!u.is_stock && (
              <button onClick={() => remove(u.uom)} className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                Xoá
              </button>
            )}
          </span>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        {d.presets.map((p) => (
          <button key={p.uom} onClick={() => setUom(p.uom)} className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm font-bold text-brand-dark" title={p.hint}>
            {p.uom}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="Đơn vị (vd Kg)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
        <input value={ups} onChange={(e) => setUps(e.target.value)} inputMode="numeric" placeholder={`1 ${d.stock_uom} = ? ${uom || "đơn vị"}`} className="rounded-lg border-2 border-emerald-300 p-2.5" />
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="Giá / đơn vị (đồng)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
      </div>
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
