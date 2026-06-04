"use client";

import { useEffect } from "react";

/**
 * Web-level kiosk hardening — ONLY a complement to OS/device kiosk lockdown (a browser tab can't
 * stop someone leaving to the OS; that must be enforced on the device). Active only when `enabled`
 * (the in-store fixed-kiosk flag), so customer phones are unaffected.
 *
 * Does: block context menu / text selection / drag / pinch-zoom gestures, and reset to a clean
 * state (`onIdle`) after `idleMs` of no interaction so a shared kiosk doesn't keep the previous
 * customer's cart/chat.
 */
export function useKioskLockdown(enabled: boolean, onIdle: () => void, idleMs = 90_000) {
  useEffect(() => {
    if (!enabled) return;
    const block = (e: Event) => e.preventDefault();
    const blockEvents = ["contextmenu", "selectstart", "dragstart", "gesturestart"] as const;
    blockEvents.forEach((e) => document.addEventListener(e, block));
    document.body.classList.add("kiosk-locked");

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, idleMs);
    };
    const activity = ["pointerdown", "touchstart", "keydown", "wheel", "mousemove"] as const;
    activity.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      blockEvents.forEach((e) => document.removeEventListener(e, block));
      activity.forEach((e) => window.removeEventListener(e, reset));
      document.body.classList.remove("kiosk-locked");
    };
  }, [enabled, onIdle, idleMs]);
}
