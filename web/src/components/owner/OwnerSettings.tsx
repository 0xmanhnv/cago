"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, Ok, Warn } from "./OwnerShared";

export function OwnerSettings() {
  const router = useRouter();
  const [b, setB] = useState({ bank_bin: "", account: "", account_name: "" });
  const [msg, setMsg] = useState<React.ReactNode>(null);

  useEffect(() => {
    frappeCall<{ bin: string; account: string; name: string }>("cago.api.payment.get_bank", {}, { method: "GET" })
      .then((d) => setB({ bank_bin: d.bin || "", account: d.account || "", account_name: d.name || "" }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setMsg(null);
    try {
      await frappeCall("cago.api.payment.save_bank", b);
      setMsg(<Ok>✅ Đã lưu tài khoản nhận tiền.</Ok>);
    } catch {
      setMsg(<Warn>Lỗi: không lưu được.</Warn>);
    }
  };

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="QR THU TIỀN (VietQR)" />
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
        {msg}
      </div>
    </div>
  );
}
