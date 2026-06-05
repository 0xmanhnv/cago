"use client";

import { useState } from "react";
import { frappeCall } from "@/lib/api";
import { NavButtons } from "./NavButtons";

interface Order {
  code: string;
  status_text: string;
  fulfilment?: string;
  payment_method?: string;
  created?: string;
  items: { display_name: string; qty: number }[];
}

/** Public order tracking: a customer who left a phone enters their order code + phone to see the
 * status (Mới → Đã xác nhận → Đang giao → Hoàn tất). Channel-agnostic — same on the public web and
 * (later) a Zalo Mini App. */
export function TrackOrder() {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    if (!code.trim() || !phone.trim()) {
      setErr("Nhập mã đơn và số điện thoại đã để lại.");
      return;
    }
    setErr("");
    setBusy(true);
    setOrder(null);
    try {
      const r = await frappeCall<Order>("cago.api.kiosk.track_order", { code: code.trim(), phone: phone.trim() }, { method: "GET" });
      setOrder(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tìm thấy đơn.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <NavButtons />
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Tra cứu đơn</div>
      </div>
      <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-card">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Mã đơn (vd WL-…)" className="w-full rounded-xl border-2 border-emerald-200 p-3 text-lg" />
        <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="Số điện thoại đã để lại" className="mt-2 w-full rounded-xl border-2 border-emerald-200 p-3 text-lg" />
        <button onClick={lookup} disabled={busy} className="mt-3 min-h-touch w-full rounded-2xl bg-brand py-3.5 text-lg font-extrabold text-white shadow-soft disabled:opacity-50">
          {busy ? "Đang tra…" : "🔎 Tra cứu"}
        </button>
        {err && <div className="mt-3 rounded-xl bg-red-100 p-3 text-center text-red-700">{err}</div>}
      </div>
      {order && (
        <div className="mt-4 animate-rise-in rounded-3xl border border-emerald-100 bg-white p-4 shadow-card">
          <div className="text-lg font-bold">Đơn {order.code}</div>
          <div className="my-2 rounded-2xl bg-emerald-50 p-4 text-center text-xl font-extrabold text-brand-dark">{order.status_text}</div>
          <div className="text-sm text-slate-500">
            {order.fulfilment}
            {order.payment_method ? ` · ${order.payment_method}` : ""}
            {order.created ? ` · ${order.created.replace("T", " ")}` : ""}
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between py-2">
                <span>{it.display_name}</span>
                <b>×{it.qty}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
