"use client";

import { useEffect } from "react";

// Hybrid scroll behaviour (native-app style), shared by the POS Shell and the kiosk Chrome:
//   • forward navigation (tap a tile / open a function) → land at the TOP
//   • back / forward-button (history pop) → RESTORE the scroll position you had on that screen
// We keep `history.scrollRestoration = "manual"` and own it ourselves, because iOS Safari's built-in
// restoration re-applies the previous page's offset a few frames late and would re-introduce the
// "opens scrolled-down, first row tucked under the sticky header" bug on forward navigation.
//
// State is module-level so it survives route remounts within the SPA session. Listeners are attached
// once (guarded) for the app's lifetime — Shell and Chrome are never mounted at the same time.

const positions = new Map<string, number>();
let isPop = false;
let wired = false;

function wireOnce() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  // back/forward button → the upcoming route change is a POP (restore), not a forward push (top).
  window.addEventListener("popstate", () => { isPop = true; });
  // Continuously remember where each screen is scrolled (rAF-throttled), keyed by pathname.
  let raf = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        positions.set(window.location.pathname, window.scrollY);
        raf = 0;
      });
    },
    { passive: true },
  );
}

/** Pass the current pathname; runs on every route change. */
export function useScrollRestoration(pathKey: string) {
  useEffect(() => {
    wireOnce();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPop) {
      // Restore — retry across frames because the screen's content (and thus its full height) often
      // loads in after the first paint, so an immediate scrollTo would clamp short.
      isPop = false;
      const y = positions.get(pathKey) ?? 0;
      let tries = 0;
      let raf = 0;
      const restore = () => {
        window.scrollTo(0, y);
        if (++tries < 12 && Math.abs(window.scrollY - y) > 2) raf = requestAnimationFrame(restore);
      };
      raf = requestAnimationFrame(restore);
      const t = setTimeout(restore, 300);
      return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    }
    // Forward / push → top, reset at several ticks to beat async content shifts. Guard so the late
    // ticks are no-ops once already at the top — a programmatic scrollTo between touchstart and click
    // cancels the click on iOS, which was eating an early "Quay lại" tap right after arriving.
    const toTop = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    toTop();
    const raf = requestAnimationFrame(toTop);
    const t1 = setTimeout(toTop, 60);
    const t2 = setTimeout(toTop, 250);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [pathKey]);
}
