"use client";

import { useEffect } from "react";

/**
 * Makes every horizontal chip/tab strip draggable + wheel-scrollable with a MOUSE on desktop.
 *
 * The app's strips (category chips, filter tabs, section tabs, shortcut rows…) all use the shared
 * `no-scrollbar` class with `overflow-x-auto`: great on touch (swipe pans), but on a PC the scrollbar
 * is hidden and there's nothing to drag — overflowed chips become unreachable. Rather than add a
 * scrollbar or per-strip handlers everywhere, one global listener (mounted once in the POS layout)
 * gives ALL of them click-drag panning + vertical-wheel → horizontal scroll. Scoped to `.no-scrollbar`
 * so it never hijacks other gestures (home-tile reorder, sliders, the page itself).
 */
export function DragScroll() {
  useEffect(() => {
    // Nearest ancestor that is one of our hidden-scrollbar strips AND actually overflows.
    const strip = (target: EventTarget | null): HTMLElement | null => {
      let n = target as HTMLElement | null;
      while (n && n !== document.body) {
        if (n.classList?.contains("no-scrollbar") && n.scrollWidth > n.clientWidth + 2) return n;
        n = n.parentElement;
      }
      return null;
    };

    let el: HTMLElement | null = null;
    let startX = 0;
    let startScroll = 0;
    let moved = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return; // touch pans natively
      const s = strip(e.target);
      if (!s) return;
      el = s;
      startX = e.clientX;
      startScroll = s.scrollLeft;
      moved = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!el) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > moved) moved = Math.abs(dx);
      el.scrollLeft = startScroll - dx;
      if (moved > 3) el.style.cursor = "grabbing";
    };
    const onUp = () => {
      if (el && moved > 5) {
        // A drag must NOT also fire the chip's click — swallow the click that follows this pointerup.
        const swallow = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener("click", swallow, true);
        };
        window.addEventListener("click", swallow, true);
        setTimeout(() => window.removeEventListener("click", swallow, true), 60);
      }
      if (el) el.style.cursor = "";
      el = null;
    };
    // Vertical wheel → horizontal scroll on a strip (only when it would otherwise do nothing useful).
    const onWheel = (e: WheelEvent) => {
      const s = strip(e.target);
      if (!s || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      s.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, []);
  return null;
}
