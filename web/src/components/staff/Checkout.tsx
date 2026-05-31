"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { ProductCard } from "@/lib/types";

interface Line {
  item_code: string;
  display_name: string;
  price_text: string;
  price: number; // best-effort estimate parsed from price_text (server is authoritative)
  qty: number;
}

interface SaleResult {
  invoice: string;
  total: number;
  total_text: string;
  payment_mode: "cash" | "bank";
  item_count: number;
}

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
// Estimate the numeric price from "15.000đ" / "15.000 đ/Bao"; server recomputes the real total.
const parsePrice = (t: string) => parseInt((t || "").replace(/[^\d]/g, ""), 10) || 0;

export function Checkout() {
  const router = useRouter();
  const [cart, setCart] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [list, setList] = useState<ProductCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    if (!query.trim()) {
      setList([]);
      return;
    }
    setSearching(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query }, { method: "GET" });
      setList(r || []);
    } finally {
      setSearching(false);
    }
  };

  const add = (p: ProductCard) => {
    setCart((c) => {
      const found = c.find((l) => l.item_code === p.item_code);
      if (found) return c.map((l) => (l.item_code === p.item_code ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { item_code: p.item_code, display_name: p.display_name, price_text: p.price_text, price: parsePrice(p.price_text), qty: 1 }];
    });
    setQ("");
    setList([]);
  };

  const setQty = (code: string, delta: number) =>
    setCart((c) => c.flatMap((l) => (l.item_code === code ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l])));

  const estimate = cart.reduce((s, l) => s + l.price * l.qty, 0);

  const checkout = async (payment_mode: "cash" | "bank") => {
    if (cart.length === 0 || busy) return;
    if (!confirm(`Xác nhận bán ${cart.length} mặt hàng — ${payment_mode === "bank" ? "chuyển khoản" : "tiền mặt"}?`)) return;
    setBusy(true);
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
        items: cart.map((l) => ({ item_code: l.item_code, qty: l.qty })),
        payment_mode,
      });
      setResult(r);
      setCart([]);
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
          <div className="mt-1 text-slate-500">{result.item_count} mặt hàng · {result.payment_mode === "bank" ? "Chuyển khoản" : "Tiền mặt"}</div>
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
    <div>
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
        placeholder="🔎 Tìm sản phẩm để thêm vào đơn..."
        className="w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg"
      />
      {q && (
        <div className="mt-1.5 rounded-xl bg-white shadow">
          {searching ? (
            <div className="p-3 text-slate-500">Đang tìm...</div>
          ) : list.length === 0 ? (
            <div className="p-3 text-slate-500">Không tìm thấy.</div>
          ) : (
            list.slice(0, 8).map((p) => (
              <button key={p.item_code} onClick={() => add(p)} className="flex w-full items-center gap-3 border-b border-slate-100 p-3 text-left last:border-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                <div className="flex-1">
                  <div className="font-bold">{p.display_name}</div>
                  <div className="text-sm font-bold text-brand">{p.price_text}</div>
                </div>
                <div className="text-2xl text-brand">＋</div>
              </button>
            ))
          )}
        </div>
      )}

      <div className="mt-4">
        {cart.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-slate-400">Chưa có sản phẩm. Tìm và bấm ＋ để thêm.</div>
        ) : (
          cart.map((l) => (
            <div key={l.item_code} className="mb-2.5 flex items-center gap-3 rounded-xl bg-white p-3 shadow">
              <div className="flex-1">
                <div className="font-bold">{l.display_name}</div>
                <div className="text-sm text-slate-500">{l.price_text}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(l.item_code, -1)} className="h-10 w-10 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                <span className="w-8 text-center text-xl font-bold">{l.qty}</span>
                <button onClick={() => setQty(l.item_code, +1)} className="h-10 w-10 rounded-lg bg-brand-light text-2xl font-bold text-brand-dark">＋</button>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div className="sticky bottom-2 mt-3 rounded-2xl bg-white p-4 shadow-lg">
          <div className="flex justify-between text-lg">
            <span className="text-slate-500">Tạm tính ({cart.reduce((s, l) => s + l.qty, 0)} món)</span>
            <span className="text-2xl font-extrabold text-brand">{money(estimate)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Tổng chính xác sẽ tính theo bảng giá khi xác nhận.</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => checkout("cash")} disabled={busy} className="min-h-touch rounded-xl bg-brand py-4 text-xl font-extrabold text-white disabled:opacity-50">
              💵 Tiền mặt
            </button>
            <button onClick={() => checkout("bank")} disabled={busy} className="min-h-touch rounded-xl bg-violet-600 py-4 text-xl font-extrabold text-white disabled:opacity-50">
              💳 Chuyển khoản
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
