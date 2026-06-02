"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, Ok, Warn } from "./OwnerShared";

interface Summary {
  cash: number;
  cash_text: string;
  bank_text: string;
  credit_text: string;
}
interface CloseResult {
  cash_sales_text: string;
  opening_text: string;
  payouts_text: string;
  expected_text: string;
  counted_text: string;
  diff_text: string;
  match: boolean;
  over: boolean;
}

export function Cashbook() {
  const router = useRouter();
  const [s, setS] = useState<Summary | null>(null);
  const [opening, setOpening] = useState("");
  const [payouts, setPayouts] = useState("");
  const [counted, setCounted] = useState("");
  const [res, setRes] = useState<CloseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  useEffect(() => {
    frappeCall<Summary>("cago.api.cashbook.today_summary", {}, { method: "GET" }).then(setS).catch(() => setS(null));
  }, []);

  const close = async () => {
    setMsg(null);
    if (busy) return;
    if (counted === "") return setMsg(<Warn>Nhập số tiền mặt đếm được trong két.</Warn>);
    setBusy(true);
    try {
      const r = await frappeCall<CloseResult>("cago.api.cashbook.day_close", {
        counted_cash: parseVnd(counted),
        opening_cash: parseVnd(opening),
        payouts: parseVnd(payouts),
      });
      setRes(r);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi chốt ca."}</Warn>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="CHỐT CA / SỔ QUỸ" />
      <div className="rounded-xl bg-white p-4">
        <div className="text-slate-600">Hôm nay đã thu:</div>
        <div className="mt-1 flex justify-between border-b border-slate-100 py-1.5">
          <span>💵 Tiền mặt (bán hàng)</span>
          <b className="text-brand">{s ? s.cash_text : "…"}</b>
        </div>
        <div className="flex justify-between border-b border-slate-100 py-1.5">
          <span>💳 Chuyển khoản</span>
          <b>{s ? s.bank_text : "…"}</b>
        </div>
        <div className="flex justify-between border-b border-slate-100 py-1.5">
          <span>📝 Bán chịu (ghi nợ)</span>
          <b className="text-red-600">{s ? s.credit_text : "…"}</b>
        </div>

        <div className="mt-3 font-bold text-slate-700">Tiền đầu ca trong két (tùy chọn)</div>
        <input value={opening} onChange={(e) => setOpening(groupVnd(e.target.value))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <div className="mt-2 font-bold text-slate-700">Tiền đã chi ra trong ca (tùy chọn)</div>
        <input value={payouts} onChange={(e) => setPayouts(groupVnd(e.target.value))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <div className="mt-2 font-bold text-slate-700">Tiền mặt đếm được trong két *</div>
        <input value={counted} onChange={(e) => setCounted(groupVnd(e.target.value))} inputMode="numeric" placeholder="Đếm tiền rồi nhập vào" className="mt-1 w-full rounded-lg border-2 border-amber-300 p-3 text-lg" />

        <button onClick={close} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
          {busy ? "Đang tính..." : "🧮 Chốt ca"}
        </button>
        {msg}

        {res && (
          <div className="mt-3 rounded-xl border-2 p-3" style={{ borderColor: res.match ? "#16a34a" : "#dc2626" }}>
            <div className="flex justify-between py-1">
              <span>Dự kiến trong két</span>
              <b>{res.expected_text}</b>
            </div>
            <div className="flex justify-between py-1">
              <span>Đếm được</span>
              <b>{res.counted_text}</b>
            </div>
            {res.match ? (
              <Ok>✅ Khớp! Két tiền đúng.</Ok>
            ) : (
              <Warn>
                {res.over ? "Thừa" : "Thiếu"} {res.diff_text} so với dự kiến — kiểm tra lại.
              </Warn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
