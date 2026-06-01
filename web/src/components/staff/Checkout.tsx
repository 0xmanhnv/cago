"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { ProductCard, Product } from "@/lib/types";

type PayMode = "cash" | "bank" | "credit";
interface SaleResult {
  invoice: string;
  total: number;
  total_text: string;
  payment_mode: PayMode;
  item_count: number;
  outstanding_text?: string;
}
interface Cust {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  outstanding_text?: string;
}
interface Meta {
  sale_units: { uom: string; price_text: string }[];
  stock_uom: string;
  stock_qty: number;
  stock_status?: string | null;
}
interface Line {
  qty: number;
  uom: string;
}

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const parsePrice = (t: string) => parseInt((t || "").replace(/[^\d]/g, ""), 10) || 0;
const trim = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);
const MODE_VI: Record<PayMode, string> = { cash: "Tiền mặt", bank: "Chuyển khoản", credit: "Ghi nợ" };

// Held (parked) orders — let staff pause a sale to serve another customer. sessionStorage so
// a refresh doesn't lose them; tied to the browser session.
interface Held {
  id: string;
  at: string;
  cust: Cust | null;
  lines: Record<string, Line>;
  meta: Record<string, Meta>;
  count: number;
}
const HELD_KEY = "cago_held_orders";
const loadHeld = (): Held[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(HELD_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveHeld = (h: Held[]) => window.sessionStorage?.setItem(HELD_KEY, JSON.stringify(h));

interface Receipt {
  invoice: string;
  store: string;
  when: string;
  lines: { name: string; qty: number; uom: string; rate_text: string; amount_text: string }[];
  total_text: string;
  paid_text?: string | null;
  outstanding_text?: string | null;
  safety?: string | null;
}
const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

async function printReceipt(invoice: string) {
  const r = await frappeCall<Receipt>("cago.api.sales.get_receipt", { invoice }, { method: "GET" });
  const rows = r.lines
    .map(
      (l) =>
        `<div class="it"><div>${esc(l.name)}</div><div class="r">${trim(l.qty)} ${esc(l.uom)} x ${l.rate_text} = <b>${l.amount_text}</b></div></div>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.invoice)}</title>
  <style>@page{size:58mm auto;margin:2mm}body{width:54mm;font-family:monospace;font-size:11px;color:#000}
  h3{text-align:center;margin:2px 0}.c{text-align:center}.it{border-bottom:1px dashed #999;padding:2px 0}.r{font-size:10px}
  .tot{font-weight:bold;font-size:14px;text-align:right;margin-top:4px}.sf{font-size:9px;border-top:1px solid #000;margin-top:4px;padding-top:3px}</style>
  </head><body>
  <h3>${esc(r.store)}</h3>
  <div class="c">HOÁ ĐƠN BÁN HÀNG</div>
  <div class="c">${esc(r.when)} · ${esc(r.invoice)}</div>
  <hr>${rows}
  <div class="tot">TỔNG: ${r.total_text}</div>
  ${r.paid_text ? `<div class="r">Khách trả: ${r.paid_text}</div>` : ""}
  ${r.outstanding_text ? `<div class="r">Còn nợ: ${r.outstanding_text}</div>` : ""}
  ${r.safety ? `<div class="sf">${esc(r.safety)}</div>` : ""}
  <div class="c" style="margin-top:6px">Cảm ơn quý khách!</div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export function Checkout() {
  const router = useRouter();
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [cust, setCust] = useState<Cust | null>(null); // null = Khách lẻ
  const [showCust, setShowCust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [discount, setDiscount] = useState("");
  const [autoPrint, setAutoPrint] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setHeld(loadHeld());
    setAutoPrint(window.localStorage?.getItem("cago_pos_autoprint") === "1");
  }, []);

  const run = async (query: string) => {
    setLoading(true);
    try {
      setList((await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query }, { method: "GET" })) || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  const ensureMeta = async (code: string): Promise<Meta | null> => {
    if (meta[code]) return meta[code];
    try {
      const p = await frappeCall<Product>("cago.api.staff.get_product", { item_code: code }, { method: "GET" });
      const m: Meta = {
        sale_units: p.sale_units && p.sale_units.length ? p.sale_units : [{ uom: p.unit || "", price_text: p.price_text }],
        stock_uom: p.unit || "",
        stock_qty: p.actual_stock_qty ?? 0,
        stock_status: p.stock_status,
      };
      setMeta((x) => ({ ...x, [code]: m }));
      return m;
    } catch {
      return null;
    }
  };

  const add = async (code: string) => {
    const m = await ensureMeta(code);
    setLines((l) => (l[code] ? l : { ...l, [code]: { qty: 1, uom: m?.stock_uom || "" } }));
  };
  const setQty = (code: string, qty: number) =>
    setLines((l) => {
      const copy = { ...l };
      if (qty <= 0) delete copy[code];
      else copy[code] = { ...copy[code], qty: trim(qty) };
      return copy;
    });
  const setUom = (code: string, uom: string) => setLines((l) => ({ ...l, [code]: { ...l[code], uom } }));

  const unitPrice = (code: string, uom: string) => {
    const u = meta[code]?.sale_units.find((s) => s.uom === uom);
    return parsePrice(u?.price_text || list.find((p) => p.item_code === code)?.price_text || "");
  };
  const cartCodes = Object.keys(lines);
  const subtotal = cartCodes.reduce((s, c) => s + unitPrice(c, lines[c].uom) * lines[c].qty, 0);
  const disc = Math.max(0, Math.min(parseInt((discount || "").replace(/[^\d]/g, ""), 10) || 0, subtotal));
  const estimate = subtotal - disc;

  const findBarcode = async (code: string) => {
    if (!code.trim()) return;
    try {
      const r = await frappeCall<{ item_code: string | null }>("cago.api.catalog.find_by_barcode", { barcode: code.trim() }, { method: "GET" });
      if (r.item_code) await add(r.item_code);
      else alert("Không tìm thấy sản phẩm với mã vạch này.");
    } catch {
      alert("Không tra được mã vạch.");
    }
  };

  const holdOrder = () => {
    if (cartCodes.length === 0) return;
    const h: Held = { id: String(Date.now()), at: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), cust, lines, meta, count: cartCodes.length };
    const next = [h, ...held];
    setHeld(next);
    saveHeld(next);
    setLines({});
    setCust(null);
  };
  const resumeOrder = (h: Held) => {
    setLines(h.lines);
    setMeta((m) => ({ ...m, ...h.meta }));
    setCust(h.cust);
    const next = held.filter((x) => x.id !== h.id);
    setHeld(next);
    saveHeld(next);
    setShowHeld(false);
  };
  const dropHeld = (id: string) => {
    const next = held.filter((x) => x.id !== id);
    setHeld(next);
    saveHeld(next);
  };

  const checkout = async (payment_mode: PayMode) => {
    if (cartCodes.length === 0 || busy) return;
    if (payment_mode === "credit" && !cust) {
      alert("Chọn khách hàng để ghi nợ (bấm vào ô khách ở trên).");
      return;
    }
    const who = cust ? ` cho ${cust.customer_name}` : "";
    if (!confirm(`${MODE_VI[payment_mode]} ${cartCodes.length} mặt hàng${who}?`)) return;
    setBusy(true);
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
        items: cartCodes.map((c) => ({ item_code: c, qty: lines[c].qty, uom: lines[c].uom })),
        payment_mode,
        customer: cust?.customer || null,
        discount_amount: disc || 0,
      });
      setResult(r);
      setLines({});
      setDiscount("");
      if (autoPrint) void printReceipt(r.invoice);
      if (payment_mode === "bank") {
        const v = await frappeCall<{ configured: boolean; url: string | null }>(
          "cago.api.payment.vietqr",
          { amount: r.total, info: `Ban hang ${r.invoice}` },
          { method: "GET" },
        );
        setQr(v.url);
      }
    } catch (e) {
      alert(`Không bán được: ${e instanceof Error ? e.message : "lỗi không rõ"}`);
    } finally {
      setBusy(false);
    }
  };

  // ---- result screen ----
  if (result) {
    return (
      <div className="text-center">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="text-6xl">✅</div>
          <div className="mt-2 text-lg font-bold">Đã bán xong</div>
          <div className="mt-1 text-slate-500">
            {result.item_count} mặt hàng · {MODE_VI[result.payment_mode]}
          </div>
          <div className="mt-2 text-4xl font-extrabold text-brand">{result.total_text}</div>
          {result.payment_mode === "credit" && result.outstanding_text && (
            <div className="mt-1 text-lg font-bold text-red-600">Khách đang nợ: {result.outstanding_text}</div>
          )}
          <div className="mt-1 text-sm text-slate-400">Hoá đơn {result.invoice}</div>
          {qr && (
            <div className="mt-4">
              <div className="text-slate-600">Khách quét mã để chuyển khoản:</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="VietQR" className="mx-auto mt-2 w-56 rounded-lg border" />
            </div>
          )}
        </div>
        <button onClick={() => printReceipt(result.invoice)} className="mt-4 min-h-touch w-full rounded-2xl bg-slate-700 py-3.5 text-lg font-extrabold text-white">
          🖨 In hoá đơn
        </button>
        <button
          onClick={() => {
            setResult(null);
            setQr(null);
            setCust(null);
            void run(q.trim());
          }}
          className="mt-2.5 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white"
        >
          🛒 Bán đơn mới
        </button>
        <button onClick={() => router.push("/staff")} className="mt-2.5 min-h-touch w-full rounded-2xl bg-slate-200 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
      </div>
    );
  }

  return (
    <div className="pb-44">
      <div className="mb-2.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">BÁN HÀNG</div>
        {held.length > 0 && (
          <button onClick={() => setShowHeld((v) => !v)} className="rounded-xl bg-amber-500 px-3 py-3 font-bold text-white">
            🗂 Đơn giữ ({held.length})
          </button>
        )}
      </div>

      {showHeld && held.length > 0 && (
        <div className="mb-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 font-bold text-amber-800">Đơn đang giữ</div>
          {held.map((h) => (
            <div key={h.id} className="flex items-center justify-between border-b border-amber-200 py-2 last:border-0">
              <span>
                <b>{h.cust ? h.cust.customer_name : "Khách lẻ"}</b> · {h.count} mặt hàng · {h.at}
              </span>
              <span className="flex gap-2">
                <button onClick={() => resumeOrder(h)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white">Mở lại</button>
                <button onClick={() => dropHeld(h.id)} className="rounded-lg bg-red-100 px-2 py-1.5 text-sm font-bold text-red-700">Xoá</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Customer bar */}
      <button
        onClick={() => setShowCust((v) => !v)}
        className="mb-2.5 flex w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-white p-3 text-left"
      >
        <span className="font-bold">
          👤 {cust ? cust.customer_name : "Khách lẻ"}
          {cust?.outstanding_text && cust.outstanding_text !== "Không nợ" && (
            <span className="ml-2 text-sm font-bold text-red-600">(đang nợ {cust.outstanding_text})</span>
          )}
        </span>
        <span className="text-slate-400">{showCust ? "▲" : "đổi ▾"}</span>
      </button>
      {showCust && <CustomerPicker onPick={(c) => { setCust(c); setShowCust(false); }} onWalkIn={() => { setCust(null); setShowCust(false); }} />}

      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="🔎 Tìm theo tên, công dụng... (để trống xem tất cả)"
        className="w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg"
      />
      <input
        placeholder="⌨ Quét/nhập mã vạch rồi Enter"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void findBarcode((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        className="mt-2 w-full rounded-xl border-2 border-emerald-300 p-3 text-base"
      />

      <div className="mt-3">
        {loading ? (
          <div className="py-6 text-center text-slate-500">Đang tải...</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy sản phẩm.</div>
        ) : (
          list.map((p) => {
            const line = lines[p.item_code];
            const m = meta[p.item_code];
            const multi = (m?.sale_units?.length || 0) > 1;
            return (
              <div key={p.item_code} className={`mb-2.5 rounded-xl border-2 p-3 shadow-sm ${line ? "border-brand bg-brand-light/40" : "border-transparent bg-white"}`}>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.image && <img src={p.image} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{p.display_name}</div>
                    <div className="text-sm font-bold text-brand">{p.price_text}</div>
                    <div className="text-xs text-slate-400">{(m && `Còn ${trim(m.stock_qty)} ${m.stock_uom}`) || p.stock_status}</div>
                  </div>
                  {!line && (
                    <button onClick={() => add(p.item_code)} className="h-11 rounded-lg bg-brand px-4 text-lg font-bold text-white">
                      ＋ Thêm
                    </button>
                  )}
                </div>

                {line && (
                  <div className="mt-2.5 border-t border-brand/20 pt-2.5">
                    {multi && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {m!.sale_units.map((u) => (
                          <button
                            key={u.uom}
                            onClick={() => setUom(p.item_code, u.uom)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${line.uom === u.uom ? "bg-brand text-white" : "bg-slate-200 text-slate-700"}`}
                          >
                            {u.uom} · {u.price_text}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(p.item_code, line.qty - 1)} className="h-11 w-11 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                        <input
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value.replace(",", "."));
                            setLines((l) => ({ ...l, [p.item_code]: { ...l[p.item_code], qty: Number.isFinite(v) ? v : 0 } }));
                          }}
                          className="h-11 w-16 rounded-lg border-2 border-emerald-300 text-center text-xl font-extrabold"
                        />
                        <button onClick={() => setQty(p.item_code, line.qty + 1)} className="h-11 w-11 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                        <span className="text-slate-500">{line.uom}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-brand">{money(unitPrice(p.item_code, line.uom) * line.qty)}</div>
                        <button onClick={() => setQty(p.item_code, 0)} className="text-sm text-red-600">Bỏ</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {cartCodes.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-[760px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-500">
                {cartCodes.length} mặt hàng{cust ? ` · ${cust.customer_name}` : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-500">Giảm:</span>
                <input
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="h-9 w-24 rounded-lg border-2 border-amber-300 px-2 text-right"
                />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-500">{disc > 0 ? `Tổng (đã giảm ${money(disc)})` : "Tổng tiền"}</span>
              <span className="text-2xl font-extrabold text-brand">{money(estimate)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button onClick={() => checkout("cash")} disabled={busy} className="min-h-touch rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
                💵 Tiền mặt
              </button>
              <button onClick={() => checkout("bank")} disabled={busy} className="min-h-touch rounded-xl bg-violet-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
                💳 C.khoản
              </button>
              <button
                onClick={() => checkout("credit")}
                disabled={busy || !cust}
                title={!cust ? "Chọn khách để ghi nợ" : ""}
                className="min-h-touch rounded-xl bg-red-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-40"
              >
                📝 Ghi nợ
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={holdOrder} disabled={busy} className="flex-1 rounded-xl border-2 border-amber-400 bg-white py-2.5 font-bold text-amber-700 disabled:opacity-50">
                🗂 Giữ đơn
              </button>
              <label className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(e) => {
                    setAutoPrint(e.target.checked);
                    window.localStorage?.setItem("cago_pos_autoprint", e.target.checked ? "1" : "0");
                  }}
                  className="h-5 w-5"
                />
                Tự in phiếu
              </label>
            </div>
            {!cust && <div className="mt-1 text-center text-xs text-slate-400">Muốn ghi nợ? Chọn khách ở ô trên cùng.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerPicker({ onPick, onWalkIn }: { onPick: (c: Cust) => void; onWalkIn: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cust[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", village: "" });
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    try {
      setRows((await frappeCall<Cust[]>("cago.api.sales.search_customers_lite", { query }, { method: "GET" })) || []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  const create = async () => {
    if (busy) return;
    if (!form.name.trim()) return alert("Nhập tên khách.");
    setBusy(true);
    try {
      const r = await frappeCall<{ customer: string; customer_name: string }>("cago.api.sales.add_customer_lite", {
        customer_name: form.name.trim(),
        phone: form.phone.trim(),
        village: form.village.trim(),
      });
      onPick({ customer: r.customer, customer_name: r.customer_name, outstanding_text: "Không nợ" });
    } catch (e) {
      alert(`Lỗi: ${e instanceof Error ? e.message : "không tạo được khách."}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2.5 rounded-xl border-2 border-brand/30 bg-white p-3">
      {adding ? (
        <div>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên khách *" className="mb-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Số điện thoại (tùy chọn)" className="mb-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} placeholder="Xóm/thôn (tùy chọn)" className="mb-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="flex-1 rounded-lg bg-brand py-2.5 font-bold text-white disabled:opacity-50">Lưu khách</button>
            <button onClick={() => setAdding(false)} className="rounded-lg bg-slate-200 px-4 font-bold">Quay lại</button>
          </div>
        </div>
      ) : (
        <div>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(tRef.current);
              tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
            }}
            placeholder="Tìm khách theo tên / SĐT..."
            className="w-full rounded-lg border-2 border-slate-300 p-2.5"
          />
          <button onClick={onWalkIn} className="mt-2 w-full rounded-lg bg-slate-100 py-2 text-left font-bold text-slate-600">👤 Khách lẻ (không ghi nợ)</button>
          <div className="mt-1 max-h-56 overflow-auto">
            {rows.map((c) => (
              <button key={c.customer} onClick={() => onPick(c)} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left">
                <span>
                  <b>{c.customer_name}</b>
                  <span className="text-slate-500"> {c.village || ""} {c.mobile ? `· ${c.mobile}` : ""}</span>
                </span>
                <span className={`text-sm font-bold ${c.outstanding_text && c.outstanding_text !== "Không nợ" ? "text-red-600" : "text-slate-400"}`}>{c.outstanding_text}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg bg-teal-600 py-2.5 font-bold text-white">➕ Thêm khách mới</button>
        </div>
      )}
    </div>
  );
}
