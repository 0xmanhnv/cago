"use client";

import { useKioskNav } from "@/lib/kioskNav";

/**
 * Two always-present kiosk controls, side by side, same place on every screen:
 *  - "‹ Quay lại": history-aware back (returns to the actual previous screen — map, a list, chat…).
 *  - "🏠 Trang chủ": one-tap escape hatch to the start (for a lost or new customer).
 * Pass `onBack` to override the back target (e.g. a product detail falling back to its category).
 */
export function KioskNavButtons({ onBack }: { onBack?: () => void }) {
  const nav = useKioskNav();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={() => (onBack ? onBack() : nav.goBack(nav.goHome))}
        className="whitespace-nowrap rounded-xl bg-brand-light px-4 py-2.5 text-lg font-extrabold text-brand-dark"
      >
        ‹ Quay lại
      </button>
      <button
        onClick={nav.goHome}
        aria-label="Trang chủ"
        className="whitespace-nowrap rounded-xl bg-brand-light px-3 py-2.5 text-lg font-extrabold text-brand-dark"
      >
        🏠
      </button>
    </div>
  );
}
