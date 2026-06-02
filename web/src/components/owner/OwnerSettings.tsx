"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar } from "./OwnerShared";
import { toast } from "@/components/ui/toast";
import { groupVnd, parseVnd } from "@/lib/utils";

export function OwnerSettings() {
  const router = useRouter();
  const [b, setB] = useState({ bank_bin: "", account: "", account_name: "" });
  const [debtVisible, setDebtVisible] = useState(false);
  const [priceEdit, setPriceEdit] = useState(false);
  const [staffCollect, setStaffCollect] = useState(false);
  const [loyalty, setLoyalty] = useState({ earn_vnd: "", redeem_vnd: "" });

  useEffect(() => {
    frappeCall<{ bin: string; account: string; name: string }>("cago.api.payment.get_bank", {}, { method: "GET" })
      .then((d) => setB({ bank_bin: d.bin || "", account: d.account || "", account_name: d.name || "" }))
      .catch(() => {});
    frappeCall<{ enabled: boolean }>("cago.api.verify.get_visible", {}, { method: "GET" })
      .then((d) => setDebtVisible(!!d.enabled))
      .catch(() => {});
    frappeCall<{ enabled: boolean }>("cago.api.verify.get_price_edit", {}, { method: "GET" })
      .then((d) => setPriceEdit(!!d.enabled))
      .catch(() => {});
    frappeCall<{ enabled: boolean }>("cago.api.verify.get_staff_collect_debt", {}, { method: "GET" })
      .then((d) => setStaffCollect(!!d.enabled))
      .catch(() => {});
    frappeCall<{ earn_vnd: number; redeem_vnd: number }>("cago.api.verify.get_loyalty", {}, { method: "GET" })
      .then((d) => setLoyalty({ earn_vnd: String(d.earn_vnd || ""), redeem_vnd: String(d.redeem_vnd || "") }))
      .catch(() => {});
  }, []);

  const toggleDebt = async () => {
    const next = !debtVisible;
    await frappeCall("cago.api.verify.set_visible", { on: next ? 1 : 0 });
    setDebtVisible(next);
  };
  const togglePriceEdit = async () => {
    const next = !priceEdit;
    await frappeCall("cago.api.verify.set_price_edit", { on: next ? 1 : 0 });
    setPriceEdit(next);
  };
  const toggleStaffCollect = async () => {
    const next = !staffCollect;
    await frappeCall("cago.api.verify.set_staff_collect_debt", { on: next ? 1 : 0 });
    setStaffCollect(next);
  };

  const save = async () => {
    try {
      await frappeCall("cago.api.payment.save_bank", b);
      toast.success("Đã lưu tài khoản nhận tiền.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  const saveLoyalty = async () => {
    try {
      const d = await frappeCall<{ earn_vnd: number; redeem_vnd: number }>("cago.api.verify.set_loyalty", {
        earn_vnd: parseVnd(loyalty.earn_vnd),
        redeem_vnd: parseVnd(loyalty.redeem_vnd),
      });
      setLoyalty({ earn_vnd: String(d.earn_vnd || ""), redeem_vnd: String(d.redeem_vnd || "") });
      toast.success("Đã lưu cài đặt tích điểm.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  return (
    <div>
      <BackBar onBack={() => router.push("/pos")} title="QR THU TIỀN (VietQR)" />
      <div className="rounded-xl bg-white p-4">
        <p className="text-slate-500">Nhập tài khoản ngân hàng của cửa hàng để hiện mã QR cho khách chuyển khoản đúng số tiền.</p>
        <label className="mt-3 block font-bold text-slate-700">Mã ngân hàng (BIN)</label>
        <input value={b.bank_bin} onChange={(e) => setB({ ...b, bank_bin: e.target.value })} placeholder="VD: 970436 (Vietcombank)" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Số tài khoản</label>
        <input value={b.account} onChange={(e) => setB({ ...b, account: e.target.value })} inputMode="numeric" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Tên chủ tài khoản</label>
        <input value={b.account_name} onChange={(e) => setB({ ...b, account_name: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={save} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Khách tự xem công nợ trên kiosk</div>
        <p className="text-slate-500">Khi bật: khách nhập SĐT ở kiosk, người bán bấm xác nhận, rồi khách xem được nợ của mình.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={debtVisible} onChange={toggleDebt} className="h-5 w-5" />
          Cho phép xem công nợ trên kiosk
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Cho phép sửa giá khi bán (mặc cả)</div>
        <p className="text-slate-500">Khi bật: lúc bán, người bán được sửa đơn giá từng mặt hàng (bớt giá cho khách). Khi tắt: luôn bán đúng bảng giá.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={priceEdit} onChange={togglePriceEdit} className="h-5 w-5" />
          Cho phép sửa giá từng dòng ở màn hình bán
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Cho phép nhân viên thu nợ khách</div>
        <p className="text-slate-500">Khi bật: nhân viên được ghi &quot;Khách trả nợ&quot; — tiền vào sổ quỹ ca của nhân viên đó và hệ thống ghi rõ ai thu. Khi tắt: chỉ chủ thu nợ.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={staffCollect} onChange={toggleStaffCollect} className="h-5 w-5" />
          Cho phép nhân viên thu nợ
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">⭐ Tích điểm khách hàng</div>
        <p className="text-slate-500">Để trống = dùng mặc định (mua 10.000đ được 1 điểm; 1 điểm đổi được 1.000đ khi mua hàng).</p>
        <label className="mt-3 block font-bold text-slate-700">Mua bao nhiêu đồng = 1 điểm</label>
        <input
          inputMode="numeric"
          value={groupVnd(loyalty.earn_vnd)}
          onChange={(e) => setLoyalty({ ...loyalty, earn_vnd: String(parseVnd(e.target.value)) })}
          placeholder="VD: 10.000"
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <label className="mt-3 block font-bold text-slate-700">1 điểm đổi được bao nhiêu đồng</label>
        <input
          inputMode="numeric"
          value={groupVnd(loyalty.redeem_vnd)}
          onChange={(e) => setLoyalty({ ...loyalty, redeem_vnd: String(parseVnd(e.target.value)) })}
          placeholder="VD: 1.000"
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <button onClick={saveLoyalty} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu tích điểm
        </button>
      </div>
    </div>
  );
}
