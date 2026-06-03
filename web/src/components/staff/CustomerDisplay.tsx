"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { CFD_CHANNEL, CFD_LAST, cfdLast, type CfdMsg } from "@/lib/cfd";

/**
 * Màn hình phụ cho khách — opened in a second window/screen at the counter. Mirrors, in real time,
 * what the cashier rings up (cart + total) and shows the payment QR big. Listens on BroadcastChannel
 * (same browser) with a `storage`-event fallback; reads the last state on open. No data is fetched
 * here and no cost/margin is ever sent — only item name, qty and the selling line total.
 */
export function CustomerDisplay() {
  const { boot } = useSession();
  const brand = boot?.brand || "Minh Tuyết";
  const [msg, setMsg] = useState<CfdMsg | null>(null);

  useEffect(() => {
    setMsg(cfdLast());
    const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel(CFD_CHANNEL) : null;
    if (bc) bc.onmessage = (e) => setMsg(e.data as CfdMsg);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CFD_LAST && e.newValue) {
        try {
          setMsg(JSON.parse(e.newValue) as CfdMsg);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const idle = !msg || msg.type === "idle";
  const cart = msg && msg.type === "cart" ? msg : null;

  return (
    // Fixed full-bleed: escape the /pos layout's centered max-width box so the customer screen
    // fills the whole display, not a card in the middle.
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-gradient-to-br from-brand to-brand-dark p-6 text-white">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-harvest/25 text-2xl ring-2 ring-harvest/60">🌾</span>
        <div className="text-2xl font-extrabold">{brand}</div>
      </div>

      {idle && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-7xl">🛒</div>
          <div className="mt-4 text-4xl font-extrabold">Kính chào quý khách</div>
          <div className="mt-2 text-xl text-emerald-100">Mời bác xem hàng — nhân viên sẽ tính tiền giúp ạ.</div>
        </div>
      )}

      {msg?.type === "qr" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-2xl font-bold text-emerald-100">Quét mã để chuyển khoản</div>
          <div className="my-4 text-5xl font-extrabold text-white">{msg.amount_text}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.url} alt="QR chuyển khoản" className="w-72 rounded-2xl border-4 border-white bg-white" />
          <div className="mt-3 text-lg text-emerald-100">Mở app ngân hàng → quét mã.</div>
        </div>
      )}

      {msg?.type === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-7xl">✅</div>
          <div className="mt-3 text-3xl font-extrabold">Cảm ơn quý khách!</div>
          <div className="mt-2 text-2xl text-emerald-100">Tổng: <b className="text-white">{msg.total_text}</b></div>
        </div>
      )}

      {cart && (
        <div className="flex flex-1 flex-col rounded-3xl bg-white/10 p-4 backdrop-blur">
          {cart.customer_name && <div className="mb-2 text-lg text-emerald-100">👤 {cart.customer_name}</div>}
          <div className="flex-1 space-y-2 overflow-auto">
            {cart.lines.length === 0 ? (
              <div className="flex h-full items-center justify-center text-2xl text-emerald-100">Giỏ hàng trống</div>
            ) : (
              cart.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/15 pb-2 text-2xl">
                  <span className="min-w-0 flex-1 truncate pr-3">
                    {l.name} <span className="text-emerald-200">× {l.qty}</span>
                  </span>
                  <span className="shrink-0 font-bold">{l.amount_text}</span>
                </div>
              ))
            )}
          </div>
          {cart.saved_text && <div className="mt-2 text-right text-xl text-amber-200">Đã giảm {cart.saved_text}</div>}
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/15 px-5 py-4">
            <span className="text-2xl font-bold">Tổng cộng</span>
            <span className="text-5xl font-extrabold text-harvest">{cart.total_text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
