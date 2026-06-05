"use client";

import { useEffect } from "react";
import { isFixedKiosk } from "@/components/kiosk/StoreMapView";
import { lockPos } from "./posLock";

/**
 * Safety net for a shared kiosk+POS device: a staff session left idle on /pos is a risk (the next
 * customer could reach back-office on the still-signed-in session). On a fixed-kiosk device, after
 * `idleMs` of no interaction, lock the POS server-side (PIN required to return) and refresh the
 * bootstrap so the gate shows. No-op on personal phones/PCs.
 */
export function usePosKioskAutoLock(signedIn: boolean, onLocked: () => void, idleMs = 180_000) {
  useEffect(() => {
    if (!signedIn || !isFixedKiosk()) return;
    let timer: ReturnType<typeof setTimeout>;
    const fire = async () => {
      try {
        await lockPos();
      } finally {
        onLocked(); // reload the bootstrap → boot.pos_locked = true → PinLock shows
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
  }, [signedIn, onLocked, idleMs]);
}
