"use client";

import { useState } from "react";
import { logout } from "@/lib/api";
import { verifyPosPin, setPosLocked } from "@/lib/posLock";
import { Keypad } from "./Keypad";

/**
 * Full-screen PIN gate shown on a shared kiosk device when the POS is locked. A correct 4-digit PIN
 * reveals the POS (the login session is kept — no password retype). "Màn hình khách" hands the
 * screen back to the customer kiosk; "Đăng xuất" ends the session entirely (end of shift).
 */
export function PinLock({ brand = "Minh Tuyết", onUnlock }: { brand?: string; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    if (verifyPosPin(next)) {
      setPosLocked(false);
      onUnlock();
    } else {
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin("");
      }, 450);
    }
  };

  const toCustomer = () => {
    window.location.href = "/"; // session kept; back to the customer kiosk
  };
  const fullLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-gradient-to-b from-brand to-brand-dark p-6 text-white">
      <div className="text-3xl font-black">🌾 {brand}</div>
      <div className="mb-7 mt-1 text-lg text-white/90">🔒 Nhập mã PIN để bán hàng</div>
      <div className="rounded-3xl bg-white/95 p-6 shadow-2xl">
        <Keypad value={pin} onPress={press} onDelete={() => setPin((p) => p.slice(0, -1))} shake={shake} />
      </div>
      <div className="mt-7 flex gap-3">
        <button onClick={toCustomer} className="rounded-xl bg-white/20 px-4 py-2.5 font-bold backdrop-blur">
          🧑‍🌾 Màn hình khách
        </button>
        <button onClick={fullLogout} className="rounded-xl bg-white/20 px-4 py-2.5 font-bold backdrop-blur">
          🚪 Đăng xuất
        </button>
      </div>
    </div>
  );
}
