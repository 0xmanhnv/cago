"use client";

import { useEffect, useState } from "react";

/**
 * True on a wide ("xl", ≥1280px) screen. Returns false on the server and on the
 * first client render (so SSR and hydration match — see the note in store/kiosk.ts),
 * then updates after mount and on resize. Use it to switch a touch-first layout to a
 * desktop one without a hydration mismatch.
 */
export function useIsDesktop(query = "(min-width: 1280px)"): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const apply = () => setDesktop(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [query]);
  return desktop;
}
