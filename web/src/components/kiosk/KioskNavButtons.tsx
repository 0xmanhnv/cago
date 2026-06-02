"use client";

import { useEffect, useState } from "react";
import { navDepth, useKioskNav } from "@/lib/kioskNav";

/**
 * Kiosk navigation controls, same place on every screen, but only as many as are useful:
 *  - Shallow (≤1 step from home → "Quay lại" would just go home): a single "‹ Trang chủ".
 *  - Deep (≥2 steps in → back ≠ home): both "‹ Quay lại" (one step) AND "🏠" (straight home).
 * Pass `onBack` to override the back target (e.g. a product detail's category fallback).
 */
export function KioskNavButtons({ onBack }: { onBack?: () => void }) {
  const nav = useKioskNav();
  // Start shallow (matches server render → no hydration mismatch), then reflect real depth after
  // mount. One harmless frame as single-button before showing both on a deep screen.
  const [deep, setDeep] = useState(false);
  useEffect(() => setDeep(navDepth() >= 2), []);
  const btn = "whitespace-nowrap rounded-xl bg-brand-light px-4 py-2.5 text-lg font-extrabold text-brand-dark";

  if (!deep) {
    return (
      <button onClick={nav.goHome} className={`shrink-0 ${btn}`}>
        ‹ Trang chủ
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button onClick={() => (onBack ? onBack() : nav.goBack(nav.goHome))} className={btn}>
        ‹ Quay lại
      </button>
      <button onClick={nav.goHome} aria-label="Trang chủ" className={`${btn} px-3`}>
        🏠
      </button>
    </div>
  );
}
