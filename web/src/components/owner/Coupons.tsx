"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { BackBar, Ok, Warn, money } from "./OwnerShared";

interface Coupon {
  coupon_code: string;
  is_active: number;
  discount_type: "Percent" | "Amount";
  discount_value: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  valid_from?: string | null;
  valid_to?: string | null;
  description?: string | null;
}

type Form = { coupon_code: string; discount_type: "Percent" | "Amount"; discount_value: string; min_order_amount: string; max_uses: string; valid_from: string; valid_to: string; description: string };
const blank: Form = { coupon_code: "", discount_type: "Percent", discount_value: "", min_order_amount: "", max_uses: "", valid_from: "", valid_to: "", description: "" };

export function Coupons() {
  const router = useRouter();
  const [rows, setRows] = useState<Coupon[]>([]);
  const [form, setForm] = useState<Form>({ ...blank });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const load = async () => setRows((await frappeCall<Coupon[]>("cago.api.coupon.list_coupons", {}, { method: "GET" })) || []);
  useEffect(() => {
    void load();
  }, []);

  const num = (s: string) => parseInt((s || "").replace(/[^\d]/g, ""), 10) || 0;

  const save = async () => {
    setMsg(null);
    if (!form.coupon_code.trim()) return setMsg(<Warn>Nhập mã.</Warn>);
    if (num(form.discount_value) <= 0) return setMsg(<Warn>Nhập giá trị giảm lớn hơn 0.</Warn>);
    setBusy(true);
    try {
      setRows(
        await frappeCall<Coupon[]>("cago.api.coupon.save_coupon", {
          coupon_code: form.coupon_code.trim().toUpperCase(),
          discount_type: form.discount_type,
          discount_value: num(form.discount_value),
          min_order_amount: num(form.min_order_amount),
          max_uses: num(form.max_uses),
          valid_from: form.valid_from || null,
          valid_to: form.valid_to || null,
          description: form.description || null,
        }),
      );
      setForm({ ...blank });
      setMsg(<Ok>✅ Đã lưu mã.</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi lưu mã."}</Warn>);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (code: string) => setRows(await frappeCall<Coupon[]>("cago.api.coupon.toggle_coupon", { coupon_code: code }));
  const remove = async (code: string) => {
    if (await confirmDialog(`Xoá mã ${code}?`, { danger: true, confirmLabel: "Xoá" })) setRows(await frappeCall<Coupon[]>("cago.api.coupon.delete_coupon", { coupon_code: code }));
  };

  const valueText = (c: Coupon) => (c.discount_type === "Percent" ? `${c.discount_value}%` : money(c.discount_value));

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="MÃ GIẢM GIÁ" />

      <div className="mt-card p-4">
        <div className="text-lg font-extrabold">➕ Tạo / sửa mã</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} placeholder="Mã (vd GIAM10)" className="rounded-lg border-2 border-emerald-300 p-2.5 uppercase" />
          <div className="flex gap-2">
            <div className="flex overflow-hidden rounded-lg border-2 border-emerald-300 font-bold">
              <button onClick={() => setForm({ ...form, discount_type: "Percent" })} className={form.discount_type === "Percent" ? "bg-brand px-3 text-white" : "bg-white px-3 text-slate-600"}>%</button>
              <button onClick={() => setForm({ ...form, discount_type: "Amount" })} className={form.discount_type === "Amount" ? "bg-brand px-3 text-white" : "bg-white px-3 text-slate-600"}>đ</button>
            </div>
            <input value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} inputMode="numeric" placeholder={form.discount_type === "Percent" ? "% giảm" : "Số tiền giảm"} className="min-w-0 flex-1 rounded-lg border-2 border-emerald-300 p-2.5" />
          </div>
          <input value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} inputMode="numeric" placeholder="Đơn tối thiểu (tùy chọn)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
          <input value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} inputMode="numeric" placeholder="Số lần dùng tối đa (0 = vô hạn)" className="rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="text-sm font-bold text-slate-600">Từ ngày<input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2" /></label>
          <label className="text-sm font-bold text-slate-600">Đến ngày<input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2" /></label>
        </div>
        <button onClick={save} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">💾 Lưu mã</button>
        {msg}
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 && <div className="mt-card p-6 text-center text-slate-400">Chưa có mã giảm giá nào.</div>}
        {rows.map((c) => (
          <div key={c.coupon_code} className={`mt-card flex items-center justify-between gap-2 p-3 ${c.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0">
              <div className="font-extrabold text-brand-dark">🎟 {c.coupon_code} {!c.is_active && <span className="text-xs font-bold text-slate-400">(tắt)</span>}</div>
              <div className="text-sm text-slate-500">
                Giảm <b>{valueText(c)}</b>
                {c.min_order_amount > 0 && ` · đơn ≥ ${money(c.min_order_amount)}`}
                {` · đã dùng ${c.used_count}${c.max_uses ? `/${c.max_uses}` : ""}`}
                {c.valid_to && ` · đến ${c.valid_to}`}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => toggle(c.coupon_code)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-bold">{c.is_active ? "Tắt" : "Bật"}</button>
              <button onClick={() => remove(c.coupon_code)} className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-bold text-red-700">Xoá</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
