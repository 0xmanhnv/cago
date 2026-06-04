"use client";

import { useEffect } from "react";
import { logout } from "./api";
import { isFixedKiosk } from "@/components/kiosk/StoreMapView";
import { hasPosPin, setPosLocked } from "./posLock";

/**
 * Safety net for a shared device that is BOTH a customer kiosk and the staff POS (one touchscreen).
 * On a fixed-kiosk device (`cago_fixed_kiosk`), a staff session left idle on /pos is a risk — the
 * next customer could reach back-office screens on the still-signed-in session. After `idleMs` of
 * no interaction:
 *  - if a quick-sell PIN is set → LOCK the POS behind the PIN (session kept; `onLock` re-renders);
 *  - otherwise → log out and return to the customer kiosk home.
 * No-op on personal phones/PCs (only when isFixedKiosk()).
 */
export function usePosKioskAutoLock(signedIn: boolean, onLock: () => void, idleMs = 180_000) {
  useEffect(() => {
    if (!signedIn || !isFixedKiosk()) return;
    let timer: ReturnType<typeof setTimeout>;
    const fire = async () => {
      if (hasPosPin()) {
        setPosLocked(true);
        onLock();
      } else {
        try {
          await logout();
        } finally {
          window.location.href = "/";
        }
      }
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(fire, idleMs);
    };
    const events = ["pointerdown", "touchstart", "keydown", "wheel", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [signedIn, onLock, idleMs]);
}
