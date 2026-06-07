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
    // Nearest ancestor that is one of our hidden-scrollbar strips AND actually overflows horizontally.
    // Crucially it must be SHORT (a one-row chip/tab strip) — tall scroll containers (the cart panel,
    // the preview sheet) also use `no-scrollbar`, and grabbing those would fight their vertical scroll.
    const strip = (target: EventTarget | null): HTMLElement | null => {
      let n = target as HTMLElement | null;
      while (n && n !== document.body) {
        if (
          n.classList?.contains("no-scrollbar") &&
          n.scrollWidth > n.clientWidth + 2 &&
          n.clientHeight <= 96 // a chip/tab row, not a tall scroll area
        )
          return n;
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
    // NOTE: deliberately NO wheel handler. Translating vertical wheel → horizontal scroll on these
    // strips hijacked normal page scrolling whenever the cursor sat over one — the owner couldn't
    // scroll the page with the mouse. Drag-to-pan alone covers the "PC can't swipe chips" need.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, []);
  return null;
}
