"use client";

import { useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";

export function Cart() {
  const kiosk = useKiosk();
  const nav = useKioskNav();
  const lines = Object.values(kiosk.cart);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const items = lines.map((x) => ({ item_code: x.product.item_code, qty: x.qty }));
      const r = await frappeCall<{ code: string; count: number }>("cago.api.kiosk.create_wanted_list", {
        items: JSON.stringify(items),
      });
      setResult(r.code);
      kiosk.clearCart();
    } catch {
      /* keep cart, allow retry */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <button onClick={nav.goHome} className="shrink-0 whitespace-nowrap rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
          ← Tiếp tục chọn
        </button>
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Giỏ đã chọn</div>
      </div>

      {result ? (
        <div className="animate-rise-in rounded-3xl border border-emerald-100 bg-white p-5 text-center shadow-card">
          <div className="text-5xl">🌾</div>
          <p className="mt-1 text-lg font-bold text-brand-dark">Đã gửi cho người bán!</p>
          <div className="my-4 rounded-2xl border-2 border-dashed border-harvest bg-harvest-light px-5 py-5 text-4xl font-black tracking-widest text-harvest-dark">
            {result}
          </div>
          <p className="text-lg">Bác đọc mã này cho người bán để lấy hàng nhé!</p>
          <button onClick={nav.goHome} className="mt-3 min-h-touch w-full rounded-2xl bg-brand py-3.5 text-lg font-extrabold text-white shadow-soft">
            Xong
          </button>
        </div>
      ) : lines.length === 0 ? (
        <div className="animate-rise-in rounded-3xl border border-emerald-100 bg-white p-8 text-center text-slate-500 shadow-soft">
          <div className="text-5xl">🧺</div>
          <div className="mt-2">Giỏ chưa có sản phẩm nào.</div>
          <button onClick={nav.goHome} className="mt-4 block w-full rounded-2xl bg-brand py-3.5 font-extrabold text-white shadow-soft">
            Chọn sản phẩm
          </button>
        </div>
      ) : (
        <div className="animate-rise-in rounded-3xl border border-emerald-100 bg-white p-4 shadow-card">
          {lines.map((x) => (
            <div key={x.product.item_code} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
              <span>
                <b>{x.product.display_name}</b>
                <br />
                <span className="font-bold text-brand">{x.product.price_text}</span>
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => kiosk.setQty(x.product.item_code, x.qty - 1)}
                  className="h-11 w-11 rounded-lg bg-brand-light text-2xl font-extrabold"
                >
                  −
                </button>
                <b className="text-xl">{x.qty}</b>
                <button
                  onClick={() => kiosk.setQty(x.product.item_code, x.qty + 1)}
                  className="h-11 w-11 rounded-lg bg-brand-light text-2xl font-extrabold"
                >
                  +
                </button>
              </span>
            </div>
          ))}
          <button
            disabled={submitting}
            onClick={submit}
            className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            📨 Gửi cho người bán
          </button>
        </div>
      )}
    </div>
  );
}
