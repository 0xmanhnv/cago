"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, uploadFile } from "@/lib/api";
import { groupVnd, parseVnd, formatVnd } from "@/lib/utils";
import { BackBar, goBackSmart } from "./Shared";
import { toast } from "@/components/ui/toast";

let RID = 0;
const rid = () => ++RID;

interface Row {
  _id: number; // stable key + correlates the result row on retry
  name: string;
  qty: number;
  unit: string;
  cost: string; // grouped string in the input
  sell: string;
  item_code: string | null;
  matched_name: string | null;
  is_new: boolean;
  invoiced: boolean; // có hoá đơn? (phần NCC tách ra ngoài HĐ vẫn vào tồn, chỉ bỏ tick)
  item_group?: string;
}
interface ParsedRow {
  name: string;
  qty: number;
  unit: string;
  cost: number;
  sell: number;
  item_code: string | null;
  matched_name: string | null;
  is_new: boolean;
}

const toRow = (p: ParsedRow): Row => ({
  _id: rid(),
  name: p.name,
  qty: p.qty || 1,
  unit: p.unit || "",
  cost: p.cost ? groupVnd(String(p.cost)) : "",
  sell: p.sell ? groupVnd(String(p.sell)) : "",
  item_code: p.item_code,
  matched_name: p.matched_name,
  is_new: p.is_new,
  invoiced: true,
});

export function BulkReceive() {
  const router = useRouter();
  const [tab, setTab] = useState<"text" | "image" | "stock">("text");
  const [txt, setTxt] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null); // evidence photo, saved on the receipt
  // select-from-stock
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ item_code: string; display_name: string; unit?: string }[]>([]);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    frappeCall<{ item_groups: string[] }>("cago.api.owner.get_product_meta", {}, { method: "GET" })
      .then((m) => setGroups(m.item_groups || []))
      .catch(() => {});
  }, []);

  const addParsed = (parsed: ParsedRow[]) => {
    if (!parsed.length) {
      toast.error("Không đọc được dòng nào. Bác thử gõ rõ hơn hoặc chụp lại ảnh.");
      return;
    }
    setRows((r) => [...r, ...parsed.map(toRow)]);
    toast.success(`Đã thêm ${parsed.length} dòng vào bảng — bác kiểm tra rồi bấm “Nhập tất cả”.`);
  };

  const analyzeText = async () => {
    if (!txt.trim()) return;
    setBusy(true);
    try {
      addParsed((await frappeCall<ParsedRow[]>("cago.api.bulk.parse_text", { text: txt })) || []);
      setTxt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi phân tích.");
    } finally {
      setBusy(false);
    }
  };

  const onImage = async (file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Ảnh quá lớn (tối đa 8MB), chụp lại nhỏ hơn nhé.");
      return;
    }
    setReading(true);
    try {
      const url = await uploadFile(file);
      setInvoiceImage(url); // the photographed invoice is also kept as evidence on the receipt
      addParsed((await frappeCall<ParsedRow[]>("cago.api.bulk.parse_image", { file_url: url })) || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Đọc ảnh chưa được, bác thử lại hoặc gõ tay.");
    } finally {
      setReading(false);
    }
  };

  // Attach an invoice photo as evidence (works in any tab — e.g. typed the list but still keep the paper).
  const attachEvidence = async (file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Ảnh quá lớn (tối đa 8MB).");
      return;
    }
    try {
      setInvoiceImage(await uploadFile(file));
    } catch {
      toast.error("Tải ảnh chứng từ lỗi, thử lại.");
    }
  };

  const searchStock = (query: string) => {
    setQ(query);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      const r = (await frappeCall<{ item_code: string; display_name: string; unit?: string }[]>("cago.api.owner.search_products", { query: query.trim() }, { method: "GET" })) || [];
      setFound(r);
    }, 250);
  };
  const addStock = (p: { item_code: string; display_name: string; unit?: string }) => {
    setRows((r) => [...r, { _id: rid(), name: p.display_name, qty: 1, unit: p.unit || "", cost: "", sell: "", item_code: p.item_code, matched_name: p.display_name, is_new: false, invoiced: true }]);
  };

  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const del = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  const submit = async () => {
    if (busy || rows.length === 0) return;
    const bad = rows.find((r) => !r.name.trim() || r.qty <= 0);
    if (bad) {
      toast.error("Có dòng thiếu tên hoặc số lượng. Bác kiểm tra lại.");
      return;
    }
    setBusy(true);
    try {
      const payload = rows.map((r) => ({
        name: r.name.trim(),
        qty: r.qty,
        unit: r.unit,
        cost: parseVnd(r.cost),
        sell: parseVnd(r.sell),
        item_code: !r.is_new && r.item_code ? r.item_code : null,
        item_group: r.item_group,
        invoiced: r.invoiced,
      }));
      const res = await frappeCall<{ ok: number; failed: number; results: { name: string; ok: boolean; error?: string }[] }>("cago.api.bulk.bulk_receive", { items: JSON.stringify(payload), invoice_image: invoiceImage });
      const fails = res.results.filter((x) => !x.ok);
      if (res.failed) toast.error(`Đã nhập ${res.ok} mặt hàng. ${res.failed} dòng lỗi: ${fails.map((f) => f.name).join(", ")}`);
      else toast.success(`Đã nhập ${res.ok} mặt hàng.`);
      // Results align 1:1 with payload order → keep exactly the failed rows by position (no name collisions).
      setRows(res.failed ? rows.filter((_, i) => res.results[i] && !res.results[i].ok) : []);
      if (!res.failed) setInvoiceImage(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi nhập hàng.");
    } finally {
      setBusy(false);
    }
  };

  const TabBtn = ({ k, children }: { k: typeof tab; children: React.ReactNode }) => (
    <button onClick={() => setTab(k)} className={`flex-1 rounded-xl px-3 py-2.5 font-bold ${tab === k ? "bg-brand text-white" : "bg-slate-200 text-slate-700"}`}>
      {children}
    </button>
  );

  return (
    <div>
      <BackBar
        onBack={() => goBackSmart(router)}
        title="⚡ Nhập hàng loạt"
        sub={
          <div className="flex gap-2">
            <TabBtn k="text">✍️ Gõ/dán</TabBtn>
            <TabBtn k="image">📷 Chụp ảnh</TabBtn>
            <TabBtn k="stock">✅ Chọn từ kho</TabBtn>
          </div>
        }
      />

      {tab === "text" && (
        <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
          <p className="mb-1 text-sm text-slate-500">Mỗi dòng một mặt hàng, vd: “Cám gà 3 bao 250k”, “NPK 5 bao”, “Thuốc cỏ 10 chai 15.000”.</p>
          <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={5} placeholder={"Cám gà 3 bao 250k\nNPK 5 bao\nThuốc cỏ 10 chai 15.000"} className="w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <button onClick={analyzeText} disabled={busy || !txt.trim()} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">Phân tích → thêm vào bảng</button>
        </div>
      )}

      {tab === "image" && (
        <div className="mb-3 rounded-xl bg-white p-3 text-center shadow-sm">
          <p className="mb-2 text-sm text-slate-500">Chụp tờ giấy ghi tay hoặc hoá đơn — máy tự đọc thành danh sách để bác kiểm tra.</p>
          <label className="inline-block min-h-touch cursor-pointer rounded-xl bg-brand px-5 py-3 font-extrabold text-white">
            {reading ? "Đang đọc ảnh..." : "📷 Chụp / chọn ảnh"}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={reading} onChange={(e) => onImage(e.target.files?.[0] || null)} />
          </label>
          {reading && <div className="mt-2 text-slate-400">Đang nhờ AI đọc, chờ chút…</div>}
        </div>
      )}

      {tab === "stock" && (
        <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
          <input value={q} onChange={(e) => searchStock(e.target.value)} enterKeyHint="search" placeholder="Tìm hàng đã có để nhập thêm..." className="w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <div className="mt-2 max-h-48 overflow-auto">
            {found.map((p) => (
              <button key={p.item_code} onClick={() => addStock(p)} className="mb-1.5 flex w-full justify-between rounded-lg bg-slate-50 p-2.5 text-left">
                <b>{p.display_name}</b>
                <span className="text-brand">＋ Thêm</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Evidence: keep a photo of the paper invoice on the receipt (chứng từ), any input mode. */}
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
        {invoiceImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={invoiceImage} alt="hoá đơn" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <span className="text-2xl">🧾</span>
        )}
        <div className="min-w-0 flex-1 text-sm text-slate-600">
          {invoiceImage ? "Đã đính kèm ảnh hoá đơn (lưu vào lịch sử nhập)." : "Đính kèm ảnh hoá đơn giấy để lưu chứng từ (tùy chọn)."}
        </div>
        {invoiceImage ? (
          <button onClick={() => setInvoiceImage(null)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700">Bỏ ảnh</button>
        ) : (
          <label className="cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white">
            📎 Đính kèm
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => attachEvidence(e.target.files?.[0] || null)} />
          </label>
        )}
      </div>

      {/* Review table */}
      {rows.length > 0 && (
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <div className="mb-1 px-1 font-bold text-slate-700">Kiểm tra {rows.length} dòng rồi nhập:</div>
          {rows.map((r, i) => (
            <div key={r._id} className="border-b border-slate-100 py-2 last:border-0">
              <div className="flex items-center gap-2">
                <input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} className="min-w-0 flex-1 rounded-lg border-2 border-emerald-300 p-2 font-bold" />
                <button onClick={() => del(i)} className="shrink-0 rounded-lg bg-red-100 px-2.5 py-2 text-sm font-bold text-red-700">Xoá</button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                {r.item_code ? (
                  // Matched an existing product: let the owner switch existing↔new WITHOUT losing
                  // the match (item_code is kept; only is_new flips, and submit honours it).
                  <button
                    onClick={() => upd(i, { is_new: !r.is_new })}
                    className={`rounded-lg px-2 py-1.5 font-bold ${r.is_new ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                    title="Chạm để đổi giữa hàng đã có / tạo mới"
                  >
                    {r.is_new ? "🆕 Tạo mới" : `✓ Đã có: ${r.matched_name || ""}`}
                  </button>
                ) : (
                  <span className="rounded-lg bg-amber-100 px-2 py-1.5 font-bold text-amber-800">🆕 Tạo mới</span>
                )}
                <input value={r.qty} onChange={(e) => upd(i, { qty: parseFloat(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" className="w-14 rounded-lg border-2 border-emerald-300 p-1.5 text-center" placeholder="SL" />
                <input value={r.unit} onChange={(e) => upd(i, { unit: e.target.value })} className="w-16 rounded-lg border-2 border-emerald-300 p-1.5" placeholder="đơn vị" />
                <input value={r.cost} onChange={(e) => upd(i, { cost: groupVnd(e.target.value) })} inputMode="numeric" className="w-24 rounded-lg border-2 border-emerald-300 p-1.5 text-right" placeholder="giá nhập" />
                {r.is_new && <input value={r.sell} onChange={(e) => upd(i, { sell: groupVnd(e.target.value) })} inputMode="numeric" className="w-24 rounded-lg border-2 border-amber-300 p-1.5 text-right" placeholder="giá bán" />}
                {r.is_new && (
                  <select value={r.item_group || ""} onChange={(e) => upd(i, { item_group: e.target.value })} className="rounded-lg border-2 border-amber-300 p-1.5">
                    <option value="">— danh mục —</option>
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => upd(i, { invoiced: !r.invoiced })}
                  className={`rounded-lg px-2 py-1.5 text-xs font-bold ${r.invoiced ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"}`}
                  title="Phần này có hoá đơn không? (phần ngoài hoá đơn vẫn vào tồn)"
                >
                  {r.invoiced ? "🧾 Có HĐ" : "Không HĐ"}
                </button>
              </div>
            </div>
          ))}
          <div className="mt-2 px-1 text-sm text-slate-500">
            Tổng tạm tính giá nhập: <b>{formatVnd(rows.reduce((s, r) => s + parseVnd(r.cost) * (r.qty || 0), 0))}</b>
          </div>
          <button onClick={submit} disabled={busy} className="mt-2 min-h-[56px] w-full rounded-xl bg-brand text-xl font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang nhập..." : `📥 Nhập tất cả (${rows.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
