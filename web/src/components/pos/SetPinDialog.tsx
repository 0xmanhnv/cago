"use client";

import { useState } from "react";
import { setPosPin, clearPosPin, hasPosPin } from "@/lib/posLock";
import { Keypad } from "./Keypad";

/**
 * Owner sets / changes / removes the quick-sell PIN for THIS device. Enter the 4 digits twice to
 * confirm. Used on a shared kiosk device so hand-over to/from the customer kiosk doesn't need a
 * full password retype (see PinLock).
 */
export function SetPinDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [done, setDone] = useState<"set" | "cleared" | null>(null);
  const had = hasPosPin();

  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    if (step === "enter") {
      setFirst(next);
      setPin("");
      setStep("confirm");
    } else if (next === first) {
      setPosPin(next);
      setDone("set");
      setTimeout(onClose, 900);
    } else {
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin("");
        setFirst("");
        setStep("enter");
      }, 500);
    }
  };

  const remove = () => {
    clearPosPin();
    setDone("cleared");
    setTimeout(onClose, 900);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-5" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="py-6">
            <div className="text-5xl">{done === "set" ? "✅" : "🗑️"}</div>
            <div className="mt-2 text-lg font-extrabold text-brand-dark">
              {done === "set" ? "Đã lưu mã PIN" : "Đã xoá mã PIN"}
            </div>
          </div>
        ) : (
          <>
            <div className="text-xl font-extrabold text-brand-dark">🔒 Mã PIN bán nhanh</div>
            <div className="mb-5 mt-1 text-sm text-slate-500">
              {step === "enter" ? "Nhập 4 số làm mã PIN cho máy này" : "Nhập lại 4 số để xác nhận"}
            </div>
            <div className="flex justify-center">
              <Keypad value={pin} onPress={press} onDelete={() => setPin((p) => p.slice(0, -1))} shake={shake} />
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2.5 font-bold text-slate-600">
                Đóng
              </button>
              {had && (
                <button onClick={remove} className="rounded-xl bg-red-100 px-4 py-2.5 font-bold text-red-700">
                  Xoá mã PIN
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
