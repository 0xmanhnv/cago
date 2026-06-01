"use client";

import { useSession } from "@/lib/session";

/**
 * Shared compact brand bar for owner/staff (and reusable elsewhere). Matches the kiosk banner
 * style — green field + harvest-gold accent — so every surface looks like one "Minh Tuyết" app.
 * `subtitle` names the area (e.g. "Chủ cửa hàng", "Nhân viên"); `right` is an optional slot.
 */
export function BrandHeader({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  const { boot } = useSession();
  const brand = boot?.brand || "Minh Tuyết";
  return (
    <div className="animate-rise-in relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark px-5 py-4 text-white shadow-card">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-harvest via-amber-300 to-harvest" />
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-harvest/20 text-2xl leading-none ring-2 ring-harvest/60">
          🌾
        </span>
        <div className="min-w-0">
          <div className="text-2xl font-extrabold leading-tight tracking-tight">{brand}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
            {subtitle || "Vật tư nông nghiệp"}
          </div>
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
    </div>
  );
}
