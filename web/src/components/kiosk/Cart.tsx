"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { initMiniApp, miniAppUser } from "@/lib/miniapp";
import Link from "next/link";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { NavButtons } from "./NavButtons";
import { CatThumb } from "./CatThumb";

export function Cart() {
  const kiosk = useKiosk();
  const nav = useKioskNav();
  const lines = Object.values(kiosk.cart);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Optional contact + fulfilment so the seller can call back / deliver (remote orders).
  const [cust, setCust] = useState({ name: "", phone: "", fulfilment: "Nhận tại cửa hàng", address: "", payment: "Trả khi nhận (COD)" });
  // Prefill the name from the mini-app host identity (e.g. Telegram user) so they type less.
  useEffect(() => {
    initMiniApp();
    const u = miniAppUser();
    if (u?.name) setCust((c) => (c.name ? c : { ...c, name: u.name as string }));
  }, []);

  const submit = async () => {
    if (submitting) return;
    setErr("");
    setSubmitting(true);
    try {
      const items = lines.map((x) => ({ item_code: x.product.item_code, qty: x.qty }));
      const r = await frappeCall<{ code: string; count: number }>("cago.api.kiosk.create_wanted_list", {
        items: JSON.stringify(items),
        customer_name: cust.name.trim() || undefined,
        customer_phone: cust.phone.trim() || undefined,
        fulfilment: cust.fulfilment,
        address: cust.fulfilment === "Giao tận nơi" ? cust.address.trim() || undefined : undefined,
        payment_method: cust.payment,
      });
      setResult(r.code);
      kiosk.clearCart();
    } catch {
      // keep the cart so the customer can retry, but tell them it didn't send.
      setErr("Gửi chưa được, bác thử lại nhé (hoặc nhờ người bán).");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <NavButtons />
        <div className="flex-1 text-2xl font-bold text-brand-dark">
          Giỏ đã chọn{lines.length > 0 && <span className="ml-2 text-base font-semibold text-slate-500">· {lines.length} sản phẩm</span>}
        </div>
      </div>

      {result ? (
        <div className="animate-rise-in rounded-3xl border border-emerald-100 bg-white p-5 text-center shadow-card">
          <div className="text-5xl">🌾</div>
          <p className="mt-1 text-lg font-bold text-brand-dark">Đã gửi cho người bán!</p>
          <div className="my-4 rounded-2xl border-2 border-dashed border-harvest bg-harvest-light px-5 py-5 text-4xl font-black tracking-widest text-harvest-dark">
            {result}
          </div>
          <p className="text-base">Bác đọc mã này cho người bán để lấy hàng nhé!</p>
          <p className="mt-2 text-sm text-slate-500">Đặt từ xa? Lưu <b>mã</b> + số điện thoại để <Link href="/track" className="font-bold text-brand underline">tra cứu trạng thái đơn</Link>.</p>
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
            <div key={x.product.item_code} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-emerald-50">
                <CatThumb image={x.product.image} icon={x.product.category_icon} color={x.product.category_color} name={x.product.display_name} variant="thumb" />
              </div>
              <div className="min-w-0 flex-1">
                <b className="block truncate">{x.product.display_name}</b>
                <span className="font-bold text-brand">{x.product.price_text}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => kiosk.setQty(x.product.item_code, x.qty - 1)} aria-label="Bớt" className="h-11 w-11 rounded-lg bg-brand-light text-2xl font-extrabold">−</button>
                <b className="w-6 text-center text-xl">{x.qty}</b>
                <button onClick={() => kiosk.setQty(x.product.item_code, x.qty + 1)} aria-label="Thêm" className="h-11 w-11 rounded-lg bg-brand-light text-2xl font-extrabold">+</button>
                <button onClick={() => kiosk.setQty(x.product.item_code, 0)} aria-label="Bỏ" className="ml-1 h-11 w-11 shrink-0 rounded-lg bg-red-50 text-lg font-bold text-red-500">✕</button>
              </div>
            </div>
          ))}
          {/* Optional contact + fulfilment — lets a customer ordering from home leave a phone so the
              seller can call back, and choose pickup or delivery. All optional (low friction). */}
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="mb-2 text-sm font-bold text-slate-600">Để người bán liên hệ / giao hàng <span className="font-normal text-slate-400">(không bắt buộc)</span></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="Tên (vd: cô Lan xóm 3)" className="min-w-0 flex-1 rounded-xl border-2 border-emerald-200 p-3" />
              <input value={cust.phone} inputMode="tel" onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="Số điện thoại" className="min-w-0 flex-1 rounded-xl border-2 border-emerald-200 p-3" />
            </div>
            <div className="mt-2 flex gap-2">
              {["Nhận tại cửa hàng", "Giao tận nơi"].map((f) => (
                <button key={f} onClick={() => setCust({ ...cust, fulfilment: f })} className={`flex-1 rounded-xl border-2 py-2.5 font-bold ${cust.fulfilment === f ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                  {f === "Giao tận nơi" ? "🚚 Giao tận nơi" : "🏪 Nhận tại cửa hàng"}
                </button>
              ))}
            </div>
            {cust.fulfilment === "Giao tận nơi" && (
              <textarea value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} rows={2} placeholder="Địa chỉ giao (xóm/thôn, mốc dễ tìm)…" className="mt-2 w-full rounded-xl border-2 border-emerald-200 p-3" />
            )}
            <div className="mt-3 text-sm font-bold text-slate-600">Cách thanh toán</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                { v: "Trả khi nhận (COD)", l: "💵 Trả khi nhận" },
                { v: "Chuyển khoản", l: "🏦 Chuyển khoản" },
                { v: "Ghi nợ", l: "📒 Ghi nợ (mua chịu)" },
              ].map((p) => (
                <button key={p.v} onClick={() => setCust({ ...cust, payment: p.v })} className={`rounded-xl border-2 px-3 py-2 text-sm font-bold ${cust.payment === p.v ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          {lines.some((x) => x.product.is_chemical) && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ Giỏ có hàng cần lưu ý an toàn (thuốc/hoá chất). Bác hỏi kỹ người bán cách dùng, đọc kỹ nhãn, để xa trẻ em & vật nuôi.
            </div>
          )}
          <button
            disabled={submitting}
            onClick={submit}
            className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {submitting ? "Đang gửi…" : "📨 Gửi cho người bán"}
          </button>
          {err && <div className="mt-3 rounded-xl bg-red-100 p-3 text-center text-red-700">{err}</div>}
        </div>
      )}
    </div>
  );
}
