"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKioskNav } from "@/lib/kioskNav";
import { normalizePhone, validPhone } from "@/lib/kioskUi";

export function MyDebt() {
  const nav = useKioskNav();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"enter" | "wait" | "done">("enter");
  const [err, setErr] = useState("");
  const [debt, setDebt] = useState<{ customer_name: string; outstanding_text: string; points?: number } | null>(null);
  const rid = useRef<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const start = async () => {
    setErr("");
    if (!validPhone(phone)) return setErr("Số điện thoại chưa đúng (vd 0987654321).");
    const r = await frappeCall<{ enabled: boolean; request_id?: string }>("cago.api.verify.request", { phone: normalizePhone(phone) });
    if (!r.enabled) return setErr("Cửa hàng chưa bật tính năng này.");
    rid.current = r.request_id || null;
    setStep("wait");
    poll.current = setInterval(async () => {
      const s = await frappeCall<{ approved: boolean; token?: string | null; expired?: boolean }>(
        "cago.api.verify.status",
        { request_id: rid.current },
        { method: "GET" },
      );
      if (s.expired) {
        if (poll.current) clearInterval(poll.current);
        setStep("enter");
        setErr("Hết hạn, bác thử lại nhé.");
        return;
      }
      if (s.approved && s.token) {
        if (poll.current) clearInterval(poll.current);
        const d = await frappeCall<{ customer_name: string; outstanding_text: string; points?: number }>("cago.api.verify.my_debt", { token: s.token });
        setDebt(d);
        setStep("done");
      }
    }, 2000);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <button onClick={nav.goHome} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
          ← Trang chủ
        </button>
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Công nợ của tôi</div>
      </div>

      {step === "enter" && (
        <div className="rounded-2xl bg-white p-5">
          <p className="text-slate-600">Bác nhập số điện thoại, rồi nhờ người bán bấm xác nhận để xem nợ của mình.</p>
          <input
            autoFocus
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="VD: 0987 654 321"
            className="mt-3 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
          />
          <button onClick={start} className="mt-3 min-h-touch w-full rounded-xl bg-brand py-4 text-xl font-extrabold text-white">
            Xem công nợ của tôi
          </button>
          {err && <div className="mt-3 rounded-lg bg-red-100 p-3 text-red-700">{err}</div>}
        </div>
      )}

      {step === "wait" && (
        <div className="rounded-2xl bg-white p-6 text-center">
          <div className="text-5xl">🙋</div>
          <p className="mt-2 text-lg">Bác nhờ <b>người bán</b> bấm xác nhận giúp ạ — đang chờ…</p>
          <div className="mt-3 inline-flex gap-1.5">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0.2s" }} />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0.4s" }} />
          </div>
        </div>
      )}

      {step === "done" && debt && (
        <div className="rounded-2xl bg-white p-6 text-center">
          <div className="text-lg font-bold">{debt.customer_name}</div>
          <div className="mt-1 text-slate-500">Bác đang nợ</div>
          <div className="mt-1 text-4xl font-extrabold text-red-600">{debt.outstanding_text}</div>
          {!!debt.points && <div className="mt-2 text-lg font-bold text-amber-600">🎁 {debt.points} điểm tích lũy</div>}
          <button onClick={nav.goHome} className="mt-4 min-h-touch w-full rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white">
            Xong
          </button>
        </div>
      )}
    </div>
  );
}
