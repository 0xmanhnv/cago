"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, logout, uploadFile } from "@/lib/api";
import type { Batch, Product, ProductCard } from "@/lib/types";

type View =
  | "home"
  | "priceLookup"
  | "editor"
  | "newProduct"
  | "addDebt"
  | "repayDebt"
  | "debtList"
  | "ledger"
  | "lowStock"
  | "report"
  | "expiry";

export function OwnerApp() {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [editCode, setEditCode] = useState("");
  const [ledgerCustomer, setLedgerCustomer] = useState("");
  const [draft, setDraft] = useState<string | null>(null);

  const goEditor = (code: string) => {
    setEditCode(code);
    setView("editor");
  };
  const goLedger = (cust: string) => {
    setLedgerCustomer(cust);
    setView("ledger");
  };
  const doLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="mx-auto max-w-[760px] p-4 text-[18px] text-[#1b2733]">
      {view === "home" && <Home onNav={setView} onLogout={doLogout} />}
      {view === "priceLookup" && (
        <PriceLookup onBack={() => setView("home")} onEdit={goEditor} />
      )}
      {view === "editor" && (
        <ProductEditor code={editCode} onBack={() => setView("home")} onDraft={setDraft} />
      )}
      {view === "newProduct" && <NewProduct onBack={() => setView("home")} onCreated={goEditor} />}
      {(view === "addDebt" || view === "repayDebt") && (
        <DebtAction mode={view === "addDebt" ? "add" : "repay"} onBack={() => setView("home")} />
      )}
      {view === "debtList" && <DebtList onBack={() => setView("home")} onOpen={goLedger} />}
      {view === "ledger" && (
        <CustomerLedger customer={ledgerCustomer} onBack={() => setView("debtList")} onDraft={setDraft} />
      )}
      {view === "lowStock" && <LowStock onBack={() => setView("home")} />}
      {view === "report" && <Report onBack={() => setView("home")} />}
      {view === "expiry" && <ExpiryReport onBack={() => setView("home")} />}

      {draft !== null && <DraftModal text={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

/* ------------------------------- shared ------------------------------- */

function BackBar({ onBack, title, label = "Trang chủ" }: { onBack: () => void; title?: string; label?: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <button onClick={onBack} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
        ← {label}
      </button>
      {title && <div className="flex-1 text-xl font-bold text-brand-dark">{title}</div>}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">{children}</div>;
}
function Ok({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-lg border border-emerald-400 bg-emerald-100 p-3 text-emerald-900">{children}</div>;
}
const money = (n: number) => n.toLocaleString("vi-VN") + "đ";

function DraftModal({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h3 className="text-lg font-bold">📩 Tin nhắn (sao chép gửi Zalo)</h3>
        <textarea
          readOnly
          value={text}
          rows={5}
          className="mt-2 w-full rounded-lg border-2 border-slate-300 p-3 text-base"
        />
        <div className="mt-3 flex gap-2.5">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(text).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
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

function Home({ onNav, onLogout }: { onNav: (v: View) => void; onLogout: () => void }) {
  const item = (label: string, color: string, v: View) => (
    <button
      onClick={() => onNav(v)}
      className={`flex min-h-[84px] items-center justify-center rounded-2xl p-2.5 text-center text-[19px] font-bold text-white ${color}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="my-4 text-center text-2xl font-bold text-brand-dark">CHỦ CỬA HÀNG</div>
      <div className="grid grid-cols-2 gap-3.5">
        {item("🔎 Tra giá", "bg-blue-600", "priceLookup")}
        {item("✏️ Sửa sản phẩm", "bg-amber-500", "editor")}
        {item("➕ Thêm sản phẩm", "bg-teal-600", "newProduct")}
        {item("📝 Ghi nợ", "bg-red-600", "addDebt")}
        {item("💵 Khách trả nợ", "bg-brand", "repayDebt")}
        {item("📒 Công nợ", "bg-violet-600", "debtList")}
        {item("📦 Hàng sắp hết", "bg-teal-600", "lowStock")}
        {item("⏰ Lô & hạn dùng", "bg-orange-600", "expiry")}
        {item("📊 Báo cáo", "bg-blue-600", "report")}
        <a
          href="/app/point-of-sale"
          className="flex min-h-[84px] items-center justify-center rounded-2xl bg-brand p-2.5 text-center text-[19px] font-bold text-white"
        >
          🛒 Bán hàng (POS)
        </a>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <a
          href="/app"
          className="flex min-h-[64px] items-center justify-center rounded-2xl bg-slate-500 p-2.5 text-center text-lg font-bold text-white"
        >
          ⚙️ Quản lý ERPNext
        </a>
        <button onClick={onLogout} className="min-h-[64px] rounded-2xl bg-red-600 text-lg font-bold text-white">
          🚪 Đăng xuất
        </button>
      </div>
    </div>
  );
}

/* product picker (search + list) reused by tra giá / sửa sản phẩm */
function ProductPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (code: string) => void }) {
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
      <div className="text-xl font-bold text-brand-dark">{title}</div>
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        list.map((p) => (
          <button
            key={p.item_code}
            onClick={() => onPick(p.item_code)}
            className="mb-3 flex w-full gap-3 rounded-xl bg-white p-3.5 text-left shadow"
          >
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

function PriceLookup({ onBack, onEdit }: { onBack: () => void; onEdit: (code: string) => void }) {
  const [p, setP] = useState<Product | null>(null);
  if (p) {
    return (
      <div>
        <BackBar onBack={() => setP(null)} label="Quay lại" />
        <div className="rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image && <img src={p.image} alt="" className="max-h-60 w-full rounded-lg bg-slate-100 object-contain" />}
          <h2 className="mt-2 text-xl font-bold">{p.display_name}</h2>
          <div className="text-3xl font-extrabold text-brand">{p.price_text}</div>
          <div className="mt-1 text-slate-500">
            Tồn: {p.stock_status || "-"} ({p.actual_stock_qty ?? 0}) · Vị trí: {p.shelf_location || "-"}
          </div>
          {p.expiry_text && <div className="mt-1 text-slate-500">HSD gần nhất: {p.expiry_text}</div>}
          {p.safety_notes && <Warn>⚠️ {p.safety_notes}</Warn>}
          <button onClick={() => onEdit(p.item_code)} className="mt-3 min-h-touch w-full rounded-xl bg-amber-500 font-extrabold text-white">
            ✏️ Sửa sản phẩm này
          </button>
        </div>
      </div>
    );
  }
  return (
    <ProductPicker
      title="TRA GIÁ"
      onBack={onBack}
      onPick={async (code) => {
        const d = await frappeCall<Product>("cago.api.owner.get_product", { item_code: code }, { method: "GET" });
        setP(d);
      }}
    />
  );
}

/* ------------------------------ editor ------------------------------ */
interface EditData {
  cago_display_name?: string;
  selling_price?: number;
  cago_stock_status_manual?: string;
  stock_status_options?: string[];
  cago_shelf_location?: string;
  cago_local_names?: string;
  cago_public_description?: string;
  cago_use_cases?: string;
  cago_crop_or_animal_targets?: string;
  cago_package_color?: string;
  cago_product_quality_tier?: string;
  quality_options?: string[];
  cago_staff_advice?: string;
  cago_call_owner_when?: string;
  cago_safety_notes?: string;
  cago_is_chemical?: number;
  cago_is_public_visible?: number;
  item_name?: string;
  images?: { main?: string; images: string[] };
}

function ProductEditor({ code, onBack, onDraft }: { code: string; onBack: () => void; onDraft: (t: string) => void }) {
  const [pick, setPick] = useState(!code);
  const [activeCode, setActiveCode] = useState(code);
  const [e, setE] = useState<EditData | null>(null);
  const [data, setData] = useState<Record<string, string | number>>({});
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [imgs, setImgs] = useState<{ main?: string; images: string[] }>({ images: [] });

  const load = async (c: string) => {
    const d = await frappeCall<EditData>("cago.api.owner.get_product_for_edit", { item_code: c }, { method: "GET" });
    setE(d);
    setImgs(d.images || { images: [] });
    const init: Record<string, string | number> = {};
    (
      [
        "cago_display_name",
        "selling_price",
        "cago_stock_status_manual",
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
      ] as const
    ).forEach((k) => (init[k] = (d as Record<string, unknown>)[k] as string | number ?? ""));
    setData(init);
  };

  useEffect(() => {
    if (activeCode) void load(activeCode);
  }, [activeCode]);

  if (pick) {
    return (
      <ProductPicker
        title="SỬA SẢN PHẨM"
        onBack={onBack}
        onPick={(c) => {
          setActiveCode(c);
          setPick(false);
        }}
      />
    );
  }
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
      <textarea
        rows={2}
        value={(data[k] as string) ?? ""}
        onChange={(ev) => set(k, ev.target.value)}
        className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base"
      />
    </label>
  );
  const Select = ({ label, k, opts }: { label: string; k: string; opts: string[] }) => (
    <label className="mt-3 block">
      <span className="mb-1 block font-bold text-slate-700">{label}</span>
      <select
        value={(data[k] as string) ?? ""}
        onChange={(ev) => set(k, ev.target.value)}
        className="w-full rounded-lg border-2 border-emerald-300 p-2.5 text-base"
      >
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
      await frappeCall("cago.api.owner.update_product", { item_code: activeCode, data: JSON.stringify(data) });
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
        last = await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.add_product_image", {
          item_code: activeCode,
          image_url: url,
        });
      } catch {
        setMsg(<Warn>Tải ảnh lỗi, thử lại.</Warn>);
        return;
      }
    }
    setImgs(last);
  };

  return (
    <div>
      <BackBar onBack={onBack} label="Quay lại" />
      <div className="rounded-xl bg-white p-4">
        <h2 className="text-xl font-bold">Sửa: {e.cago_display_name || e.item_name}</h2>

        {/* images */}
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
                  onClick={async () =>
                    setImgs(
                      await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.set_main_image", {
                        item_code: activeCode,
                        image_url: u,
                      }),
                    )
                  }
                  className="rounded bg-slate-200 px-2 py-1 text-sm font-bold"
                >
                  Đặt ảnh chính
                </button>
              )}
            </div>
            <button
              onClick={async () => {
                if (confirm("Xoá ảnh này?"))
                  setImgs(
                    await frappeCall<{ main?: string; images: string[] }>("cago.api.owner.remove_product_image", {
                      item_code: activeCode,
                      image_url: u,
                    }),
                  );
              }}
              className="rounded bg-red-100 px-2 py-1 text-sm font-bold text-red-700"
            >
              Xoá
            </button>
          </div>
        ))}

        {/* fields */}
        <div className="mt-4 text-lg font-extrabold">Thông tin sản phẩm</div>
        <Field label="Tên hiển thị" k="cago_display_name" />
        <Field label="Giá bán (đồng)" k="selling_price" type="number" />
        <Select label="Tồn kho hiển thị" k="cago_stock_status_manual" opts={e.stock_status_options || []} />
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
            const r = await frappeCall<{ text: string }>("cago.api.owner.zalo_draft", { kind: "restock", item_code: activeCode });
            onDraft(r.text);
          }}
          className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white"
        >
          📩 Soạn tin báo hàng về
        </button>
        {msg}

        {/* batch / expiry (Phase 1) */}
        <BatchSection code={activeCode} isChemical={!!data.cago_is_chemical} />
      </div>
    </div>
  );
}

function BatchSection({ code }: { code: string; isChemical: boolean }) {
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
      <div className="text-lg font-extrabold">Lô hàng & hạn sử dụng</div>
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
        <input
          value={bid}
          onChange={(e) => setBid(e.target.value)}
          placeholder="Mã lô (vd L240501)"
          className="min-w-[120px] flex-1 rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <input
          type="date"
          value={exp}
          onChange={(e) => setExp(e.target.value)}
          className="rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <button onClick={add} className="rounded-lg bg-brand px-4 font-extrabold text-white">
          + Thêm lô
        </button>
      </div>
      {msg}
    </div>
  );
}

function NewProduct({ onBack, onCreated }: { onBack: () => void; onCreated: (code: string) => void }) {
  const [meta, setMeta] = useState<{ item_groups: string[]; uoms: string[]; stock_status_options: string[] } | null>(null);
  const [f, setF] = useState({ name: "", group: "", unit: "Bao", price: "", stock: "", chem: false, pub: true });
  const [msg, setMsg] = useState<React.ReactNode>(null);
  useEffect(() => {
    frappeCall<typeof meta>("cago.api.owner.get_product_meta", {}, { method: "GET" }).then(setMeta).catch(() => {});
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
          selling_price: f.price,
          cago_stock_status_manual: f.stock,
          cago_is_chemical: f.chem ? 1 : 0,
          cago_is_public_visible: f.pub ? 1 : 0,
        }),
      });
      onCreated(r.item_code);
    } catch {
      setMsg(<Warn>Lỗi: không tạo được sản phẩm.</Warn>);
    }
  };

  return (
    <div>
      <BackBar onBack={onBack} title="THÊM SẢN PHẨM" />
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
        <input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
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

/* ------------------------------ debt ------------------------------ */
interface CustomerHit {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  debt?: number;
}

function CustomerPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (c: string) => void }) {
  const [list, setList] = useState<CustomerHit[]>([]);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [form, setForm] = useState({ name: "", phone: "", village: "" });
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
      if (!form.name.trim()) return setMsg(<Warn>Nhập tên khách.</Warn>);
      try {
        const r = await frappeCall<{ customer: string }>("cago.api.debt.add_customer", {
          customer_name: form.name.trim(),
          phone: form.phone.trim(),
          village: form.village.trim(),
        });
        onPick(r.customer);
      } catch {
        setMsg(<Warn>Lỗi: không tạo được khách.</Warn>);
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

function DebtAction({ mode, onBack }: { mode: "add" | "repay"; onBack: () => void }) {
  const [cust, setCust] = useState("");
  const [info, setInfo] = useState<{ customer_name: string; outstanding_text: string } | null>(null);
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const method = mode === "add" ? "cago.api.debt.record_debt" : "cago.api.debt.record_repayment";
  const title = mode === "add" ? "GHI NỢ" : "KHÁCH TRẢ NỢ";

  if (!cust) {
    return (
      <CustomerPicker
        title={title}
        onBack={onBack}
        onPick={async (c) => {
          setCust(c);
          const d = await frappeCall<{ customer_name: string; outstanding_text: string }>(
            "cago.api.debt.get_customer_debt",
            { customer: c },
            { method: "GET" },
          );
          setInfo(d);
        }}
      />
    );
  }
  if (!info) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  const save = async () => {
    const val = parseFloat(amt);
    setMsg(null);
    if (!val || val <= 0) return setMsg(<Warn>Số tiền phải lớn hơn 0.</Warn>);
    if (!confirm(`${mode === "add" ? "Ghi nợ " : "Khách trả "}${money(val)} cho ${info.customer_name}?`)) return;
    try {
      const r = await frappeCall<{ outstanding_text: string }>(method, { customer: cust, amount: val });
      setMsg(<Ok>✅ Xong. Nợ còn lại: {r.outstanding_text}</Ok>);
      setAmt("");
    } catch {
      setMsg(<Warn>Lỗi: không lưu được.</Warn>);
    }
  };

  return (
    <div>
      <BackBar onBack={() => setCust("")} label="Quay lại" />
      <div className="rounded-xl bg-white p-4">
        <h2 className="text-xl font-bold">{info.customer_name}</h2>
        <div className="flex justify-between border-b border-slate-100 py-2">
          <span className="text-slate-500">Đang nợ</span>
          <span className="font-bold text-red-600">{info.outstanding_text}</span>
        </div>
        <p className="mt-2 text-slate-500">{mode === "add" ? "Số tiền ghi nợ thêm" : "Số tiền khách trả"} (đồng):</p>
        <input autoFocus inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-3 text-xl" />
        <button onClick={save} className={`mt-3 min-h-touch w-full rounded-xl font-extrabold text-white ${mode === "add" ? "bg-red-600" : "bg-brand"}`}>
          {mode === "add" ? "Ghi nợ" : "Xác nhận trả"}
        </button>
        {msg}
      </div>
    </div>
  );
}

interface LedgerEntry {
  type: "debt" | "repay";
  label: string;
  date: string;
  amount_text: string;
  voucher_type: string;
  voucher_no: string;
}
function CustomerLedger({ customer, onBack, onDraft }: { customer: string; onBack: () => void; onDraft: (t: string) => void }) {
  type Ledger = { customer_name: string; outstanding_text: string; overpaid?: boolean; entries: LedgerEntry[] };
  const [d, setD] = useState<Ledger | null>(null);
  const load = async () => setD(await frappeCall<Ledger>("cago.api.debt.get_customer_ledger", { customer }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);
  if (!d) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  return (
    <div>
      <BackBar onBack={onBack} label="Quay lại" />
      <div className="rounded-xl bg-white p-4">
        <h2 className="text-xl font-bold">{d.customer_name}</h2>
        <div className="flex justify-between border-b border-slate-100 py-2">
          <span className="text-slate-500">{d.overpaid ? "Khách trả dư" : "Đang nợ"}</span>
          <span className="font-bold text-red-600">{d.outstanding_text}</span>
        </div>
        <button
          onClick={async () => {
            const r = await frappeCall<{ text: string }>("cago.api.owner.zalo_draft", { kind: "debt_reminder", customer });
            onDraft(r.text);
          }}
          className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white"
        >
          📩 Soạn tin nhắc nợ (Zalo)
        </button>
        <div className="mt-3 font-extrabold">Lịch sử ghi nợ / trả nợ</div>
        {d.entries.length === 0 && <div className="text-slate-500">Chưa có giao dịch.</div>}
        {d.entries.map((e, i) => (
          <div key={i} className="flex justify-between border-b border-slate-100 py-2">
            <span>
              <b>
                {e.type === "debt" ? "📝" : "💵"} {e.label}
              </b>
              <br />
              <span className="text-slate-500">{e.date}</span>
            </span>
            <span className="text-right">
              <b className={e.type === "debt" ? "text-red-600" : "text-brand"}>
                {e.type === "debt" ? "+" : "−"}
                {e.amount_text}
              </b>
              <br />
              <button
                onClick={async () => {
                  if (!confirm("Huỷ bút toán này? (dùng khi ghi nhầm)")) return;
                  await frappeCall("cago.api.debt.cancel_entry", { voucher_type: e.voucher_type, voucher_no: e.voucher_no, customer });
                  await load();
                }}
                className="rounded bg-red-100 px-2 py-1 text-[13px] font-bold text-red-700"
              >
                Huỷ
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebtList({ onBack, onOpen }: { onBack: () => void; onOpen: (c: string) => void }) {
  const [list, setList] = useState<{ customer: string; customer_name: string; village?: string; outstanding_text: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    frappeCall<typeof list>("cago.api.reports.debt_list", {}, { method: "GET" }).then((r) => {
      setList(r || []);
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <BackBar onBack={onBack} title="CÔNG NỢ KHÁCH HÀNG" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <Ok>Không có khách nào đang nợ. 🎉</Ok>
      ) : (
        list.map((c) => (
          <button key={c.customer} onClick={() => onOpen(c.customer)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow">
            <div>
              <div className="font-bold">{c.customer_name}</div>
              <div className="text-slate-500">{c.village || ""} · bấm xem chi tiết</div>
            </div>
            <div className="text-xl font-bold text-red-600">{c.outstanding_text}</div>
          </button>
        ))
      )}
    </div>
  );
}

function LowStock({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<{ display_name: string; shelf_location?: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    frappeCall<typeof list>("cago.api.reports.low_stock", {}, { method: "GET" }).then((r) => {
      setList(r || []);
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <BackBar onBack={onBack} title="HÀNG SẮP HẾT" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <Ok>Không có hàng nào sắp hết. 👍</Ok>
      ) : (
        list.map((p, i) => (
          <div key={i} className="mb-2 flex items-center justify-between rounded-xl bg-white p-3.5 shadow">
            <div>
              <div className="font-bold">{p.display_name}</div>
              <div className="text-slate-500">{p.shelf_location || ""}</div>
            </div>
            <div className="font-bold text-red-600">{p.status}</div>
          </div>
        ))
      )}
    </div>
  );
}

function Report({ onBack }: { onBack: () => void }) {
  type Summary = { period_label: string; sales_total_text: string; invoice_count: number };
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [s, setS] = useState<Summary | null>(null);
  const [best, setBest] = useState<{ display_name: string; qty: number }[]>([]);
  useEffect(() => {
    frappeCall<Summary>("cago.api.reports.period_summary", { period }, { method: "GET" }).then(setS);
    frappeCall<{ display_name: string; qty: number }[]>("cago.api.reports.best_sellers", { limit: 5 }, { method: "GET" }).then(
      (r) => setBest(r || []),
    );
  }, [period]);

  const tab = (p: "today" | "week" | "month", label: string) => (
    <button
      onClick={() => setPeriod(p)}
      className={`rounded-xl px-4 py-3 font-bold ${p === period ? "bg-blue-600 text-white" : "bg-brand-light text-brand-dark"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <BackBar onBack={onBack} title="BÁO CÁO" />
      <div className="mb-3 flex gap-2">
        {tab("today", "Hôm nay")}
        {tab("week", "Tuần")}
        {tab("month", "Tháng")}
      </div>
      <div className="rounded-xl bg-white p-4">
        {!s ? (
          <div className="text-slate-500">Đang tải...</div>
        ) : (
          <>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">Kỳ</span>
              <b>{s.period_label}</b>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">Doanh thu</span>
              <span className="text-2xl font-extrabold text-brand">{s.sales_total_text}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">Số hóa đơn</span>
              <b>{s.invoice_count}</b>
            </div>
            {best.length > 0 ? (
              <>
                <div className="mt-2.5 font-bold">Bán chạy</div>
                {best.map((b, i) => (
                  <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span>{b.display_name}</span>
                    <b>{b.qty}</b>
                  </div>
                ))}
              </>
            ) : (
              <div className="mt-2.5 text-slate-500">Chưa có dữ liệu bán hàng.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ExpiryReport({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    frappeCall<Batch[]>("cago.api.inventory.expiring_soon", { days: 60 }, { method: "GET" }).then((r) => {
      setRows(r || []);
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <BackBar onBack={onBack} title="LÔ SẮP HẾT HẠN (60 ngày)" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <Ok>Không có lô nào sắp hết hạn. 👍</Ok>
      ) : (
        rows.map((b) => (
          <div key={b.batch} className="mb-2 flex items-center justify-between rounded-xl bg-white p-3.5 shadow">
            <div>
              <div className="font-bold">{b.display_name}</div>
              <div className="text-slate-500">
                Lô {b.batch_id} · HSD {b.expiry_text}
              </div>
            </div>
            <div className={b.expiry_status === "expired" ? "font-bold text-red-600" : "font-bold text-amber-600"}>
              {b.expiry_status === "expired" ? "Đã hết hạn" : `Còn ${b.days_left} ngày`}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
