"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";

// Agri-shop reasons (the bot-originated "Trợ lý chưa trả lời được" arrives via prefill, not shown
// as a choice here). Keep the list short with big touch targets for low-tech rural customers.
const REASONS = ["Tư vấn sản phẩm", "Xem / lấy hàng", "Hỏi giá / thanh toán", "Ghi nợ / công nợ", "Khác"];

type Req = { name: string; status: string; assigned_name: string; reason: string };

function kioskLabel() {
  if (typeof window === "undefined") return "Kiosk";
  return window.localStorage.getItem("cago_kiosk_label") || "Kiosk";
}

export function CallStaff({ onDone }: { onDone: () => void }) {
  const { focusItem, focusName, sessionId, callStaffPrefill } = useKiosk();
  const [reason, setReason] = useState(callStaffPrefill?.reason || "");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [req, setReq] = useState<Req | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const submit = async (chosen: string) => {
    if (sending) return;
    setSending(true);
    try {
      const r = await frappeCall<Req>("cago.api.support.create_request", {
        reason: chosen,
        note: note || null,
        kiosk_label: kioskLabel(),
        focus_item: focusItem || null,
        focus_name: focusName || null,
        question: callStaffPrefill?.question || null,
        session_id: sessionId || null,
        customer_name: name || null,
      });
      setReq(r);
    } catch {
      setReq({ name: "", status: "error", assigned_name: "", reason: chosen });
    } finally {
      setSending(false);
    }
  };

  // Poll our own request while it's open so the customer sees "đang đến" / auto-closes when resolved.
  useEffect(() => {
    if (!req?.name || !["pending", "accepted"].includes(req.status)) return;
    timer.current = setInterval(async () => {
      try {
        const r = await frappeCall<Req>("cago.api.support.request_status", { name: req.name, session_id: sessionId || null });
        setReq(r);
        if (r.status === "resolved" || r.status === "cancelled") {
          setTimeout(onDone, r.status === "resolved" ? 1800 : 0);
        }
      } catch {
        /* keep last state; try again next tick */
      }
    }, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [req?.name, req?.status, onDone]);

  const cancel = async () => {
    if (req?.name) {
      try {
        await frappeCall("cago.api.support.cancel_request", { name: req.name, session_id: sessionId || null });
      } catch {
        /* ignore — close anyway */
      }
    }
    onDone();
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-5">
      <div className="animate-pop-in w-full max-w-md rounded-2xl bg-white p-6">
        {!req ? (
          // STEP 1 — pick a reason (or auto-shown reason from the assistant) + optional note.
          <>
            <div className="text-center text-5xl">🔔</div>
            <h2 className="mt-2 text-center text-2xl font-bold text-brand-dark">Bác cần hỗ trợ gì ạ?</h2>
            {focusName && (
              <p className="mt-1 text-center text-sm text-slate-500">Đang xem: <b>{focusName}</b></p>
            )}
            {callStaffPrefill?.question && (
              <p className="mt-1 rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-800">💬 “{callStaffPrefill.question}”</p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-2.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  disabled={sending}
                  onClick={() => { setReason(r); submit(r); }}
                  className={`min-h-touch rounded-xl border-2 px-4 py-3.5 text-lg font-bold transition disabled:opacity-50 ${
                    reason === r ? "border-brand bg-brand text-white" : "border-emerald-200 bg-brand-light text-brand-dark hover:border-brand"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Mô tả cần hỗ trợ gì (không bắt buộc)… vd: cần lấy bao cám gà ở kệ trong"
              className="mt-3 w-full rounded-xl border-2 border-emerald-200 p-3 text-base"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên của bác (không bắt buộc)"
              className="mt-2 w-full rounded-xl border-2 border-emerald-200 p-3 text-base"
            />
            <button onClick={onDone} className="mt-3 w-full rounded-xl bg-slate-100 py-3 font-bold text-slate-600">
              Thôi, đóng lại
            </button>
            {callStaffPrefill?.reason && (
              <button
                disabled={sending}
                onClick={() => submit(callStaffPrefill.reason!)}
                className="mt-2 w-full rounded-xl bg-red-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-50"
              >
                🔔 Gọi nhân viên ngay
              </button>
            )}
          </>
        ) : (
          // STEP 2 — status: notified → on the way → done / busy.
          <div className="text-center">
            {req.status === "error" ? (
              <>
                <div className="text-5xl">📵</div>
                <h2 className="mt-2 text-xl font-bold text-red-600">Chưa gọi được</h2>
                <p className="mt-1 text-slate-600">Bác thử lại, hoặc gọi trực tiếp người bán giúp cháu ạ.</p>
              </>
            ) : req.status === "accepted" ? (
              <>
                <div className="text-5xl">🚶‍♂️</div>
                <h2 className="mt-2 text-2xl font-bold text-brand-dark">{req.assigned_name || "Nhân viên"} đang tới ạ!</h2>
                <p className="mt-1 text-slate-600">Bác chờ một chút giúp cháu nhé.</p>
              </>
            ) : req.status === "resolved" ? (
              <>
                <div className="text-5xl">✅</div>
                <h2 className="mt-2 text-2xl font-bold text-brand">Đã hỗ trợ xong ạ!</h2>
              </>
            ) : req.status === "expired" ? (
              <>
                <div className="text-5xl">⏳</div>
                <h2 className="mt-2 text-xl font-bold text-amber-700">Người bán đang bận</h2>
                <p className="mt-1 text-slate-600">Cháu đã báo lại cô chủ. Bác chờ chút hoặc gọi trực tiếp giúp cháu ạ.</p>
              </>
            ) : (
              <>
                <div className="text-5xl">🔔</div>
                <h2 className="mt-2 text-2xl font-bold text-brand-dark">Đã gọi nhân viên ✅</h2>
                <p className="mt-1 text-slate-600">Nhu cầu: <b>{req.reason}</b></p>
                <p className="text-slate-600">Nhân viên sẽ tới hỗ trợ bác trong ít phút ạ.</p>
              </>
            )}
            <button
              onClick={req.status === "pending" || req.status === "accepted" ? cancel : onDone}
              className="mt-5 w-full rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white"
            >
              {req.status === "pending" || req.status === "accepted" ? "Huỷ yêu cầu" : "Đóng"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
