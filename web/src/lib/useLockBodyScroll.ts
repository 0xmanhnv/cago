import { useEffect } from "react";

/**
 * Lock the page behind a modal/sheet while it's open, so the background can't scroll under it
 * (a real touch-usability problem on the POS/kiosk). Restores the previous overflow on close.
 */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
