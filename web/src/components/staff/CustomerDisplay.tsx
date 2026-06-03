"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { frappeCall } from "@/lib/api";
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
    // Same-machine 2nd window: instant via BroadcastChannel + the storage event.
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
    // Separate device: poll the server relay (~1.2s), gated by the pairing token in the URL
    // (/display?k=<token>). No token → no server reads (the same-machine BroadcastChannel still works).
    const token = new URLSearchParams(window.location.search).get("k") || "";
    let alive = true;
    const poll = async () => {
      if (!token) return;
      try {
        const s = await frappeCall<CfdMsg>("cago.api.display.get_state", { token }, { method: "GET" });
        if (alive && s) setMsg(s);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = token ? setInterval(poll, 1200) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
      bc?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // An empty cart shows the welcome screen, never a card with a phantom total.
  const cart = msg?.type === "cart" && msg.lines.length > 0 ? msg : null;
  const idle = !msg || msg.type === "idle" || (msg.type === "cart" && !cart);

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
          {/* Stack label above the amount + size the number to the viewport so it never overlaps the
              label or overflow on a narrow phone (the screen may be a phone, tablet, or wide monitor). */}
          <div className="mt-3 rounded-2xl bg-white/15 px-5 py-4 text-center">
            <div className="text-xl font-bold text-emerald-50">Tổng cộng</div>
            <div className="break-words font-extrabold leading-tight text-harvest" style={{ fontSize: "clamp(2.25rem, 11vw, 5rem)" }}>
              {cart.total_text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
