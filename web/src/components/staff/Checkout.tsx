"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { ProductCard, Product } from "@/lib/types";

interface SaleResult {
  invoice: string;
  total: number;
  total_text: string;
  payment_mode: "cash" | "bank";
  item_count: number;
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

// Open a 58mm print window for the receipt (works with thermal printers + normal printers).
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query }, { method: "GET" });
      setList(r || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  // Load per-item units + live stock the first time an item is added.
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
  const estimate = cartCodes.reduce((s, c) => s + unitPrice(c, lines[c].uom) * lines[c].qty, 0);

  const checkout = async (payment_mode: "cash" | "bank") => {
    if (cartCodes.length === 0 || busy) return;
    if (!confirm(`Xác nhận bán ${cartCodes.length} mặt hàng — ${payment_mode === "bank" ? "chuyển khoản" : "tiền mặt"}?`)) return;
    setBusy(true);
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
        items: cartCodes.map((c) => ({ item_code: c, qty: lines[c].qty, uom: lines[c].uom })),
        payment_mode,
      });
      setResult(r);
      setLines({});
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

  if (result) {
    return (
      <div className="text-center">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="text-6xl">✅</div>
          <div className="mt-2 text-lg font-bold">Đã bán xong</div>
          <div className="mt-1 text-slate-500">
            {result.item_count} mặt hàng · {result.payment_mode === "bank" ? "Chuyển khoản" : "Tiền mặt"}
          </div>
          <div className="mt-2 text-4xl font-extrabold text-brand">{result.total_text}</div>
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
            void run(q.trim()); // refresh stock after a sale
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
    <div className="pb-40">
      <div className="mb-2.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">BÁN HÀNG</div>
      </div>

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
            <div className="flex items-baseline justify-between">
              <span className="text-slate-500">Tạm tính · {cartCodes.length} mặt hàng</span>
              <span className="text-2xl font-extrabold text-brand">{money(estimate)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button onClick={() => checkout("cash")} disabled={busy} className="min-h-touch rounded-xl bg-brand py-4 text-xl font-extrabold text-white disabled:opacity-50">
                💵 Tiền mặt
              </button>
              <button onClick={() => checkout("bank")} disabled={busy} className="min-h-touch rounded-xl bg-violet-600 py-4 text-xl font-extrabold text-white disabled:opacity-50">
                💳 Chuyển khoản
              </button>
            </div>
            <div className="mt-1 text-center text-xs text-slate-400">Tổng chính xác tính theo bảng giá khi xác nhận.</div>
          </div>
        </div>
      )}
    </div>
  );
}
