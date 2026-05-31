"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { ProductCard } from "@/lib/types";

interface SaleResult {
  invoice: string;
  total: number;
  total_text: string;
  payment_mode: "cash" | "bank";
  item_count: number;
}

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
// Estimate the numeric price from "320.000đ / Bao"; the server recomputes the real total.
const parsePrice = (t: string) => parseInt((t || "").replace(/[^\d]/g, ""), 10) || 0;

export function Checkout() {
  const router = useRouter();
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({}); // item_code -> qty in cart
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query }, { method: "GET" });
      setList(r || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run(""); // show the full catalog up front — staff browse + tap to add
  }, []);

  const priceOf = (code: string) => parsePrice(list.find((p) => p.item_code === code)?.price_text || "");
  const bump = (code: string, delta: number) =>
    setQty((m) => {
      const next = (m[code] || 0) + delta;
      const copy = { ...m };
      if (next <= 0) delete copy[code];
      else copy[code] = next;
      return copy;
    });

  const cartCodes = Object.keys(qty);
  const totalQty = cartCodes.reduce((s, c) => s + qty[c], 0);
  const estimate = cartCodes.reduce((s, c) => s + priceOf(c) * qty[c], 0);

  const checkout = async (payment_mode: "cash" | "bank") => {
    if (cartCodes.length === 0 || busy) return;
    if (!confirm(`Xác nhận bán ${cartCodes.length} mặt hàng — ${payment_mode === "bank" ? "chuyển khoản" : "tiền mặt"}?`)) return;
    setBusy(true);
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
        items: cartCodes.map((c) => ({ item_code: c, qty: qty[c] })),
        payment_mode,
      });
      setResult(r);
      setQty({});
      if (payment_mode === "bank") {
        const v = await frappeCall<{ configured: boolean; url: string | null }>(
          "cago.api.payment.vietqr",
          { amount: r.total, info: `Ban hang ${r.invoice}` },
          { method: "GET" },
        );
        setQr(v.url);
      }
    } catch (e) {
      alert(`Lỗi: không bán được. ${e instanceof Error ? e.message : ""}`);
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
        <button
          onClick={() => {
            setResult(null);
            setQr(null);
          }}
          className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white"
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
    <div className="pb-32">
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
            const inCart = qty[p.item_code] || 0;
            return (
              <div key={p.item_code} className={`mb-2.5 flex items-center gap-3 rounded-xl border-2 p-3 shadow-sm ${inCart ? "border-brand bg-brand-light/40" : "border-transparent bg-white"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{p.display_name}</div>
                  <div className="text-sm font-bold text-brand">{p.price_text}</div>
                  <div className="text-xs text-slate-400">{p.stock_status}</div>
                </div>
                {inCart > 0 ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => bump(p.item_code, -1)} className="h-11 w-11 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                    <span className="w-7 text-center text-xl font-extrabold">{inCart}</span>
                    <button onClick={() => bump(p.item_code, +1)} className="h-11 w-11 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                  </div>
                ) : (
                  <button onClick={() => bump(p.item_code, +1)} className="h-11 rounded-lg bg-brand px-4 text-lg font-bold text-white">
                    ＋ Thêm
                  </button>
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
              <span className="text-slate-500">Tạm tính · {totalQty} món / {cartCodes.length} mặt hàng</span>
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
