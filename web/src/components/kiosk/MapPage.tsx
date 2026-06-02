"use client";

import { useEffect, useState } from "react";
import { useKioskNav } from "@/lib/kioskNav";
import { StoreMapView, isFixedKiosk } from "./StoreMapView";

export function MapPage() {
  const nav = useKioskNav();
  const [fixed, setFixed] = useState(false);
  useEffect(() => setFixed(isFixedKiosk()), []);

  const toggleFixed = () => {
    const v = !fixed;
    setFixed(v);
    if (v) window.localStorage?.setItem("cago_fixed_kiosk", "1");
    else window.localStorage?.removeItem("cago_fixed_kiosk");
    window.location.reload(); // re-render the map with the new start point
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <button onClick={nav.goHome} className="shrink-0 whitespace-nowrap rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
          ‹ Trang chủ
        </button>
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Sơ đồ cửa hàng</div>
      </div>

      <p className="mb-2 text-slate-600">Chạm vào một khu để xem hàng trong khu đó. (Sơ đồ tham khảo)</p>

      <StoreMapView onPickZone={(g) => nav.openList(g)} />

      {/* One-time setup: mark THIS device as the fixed counter kiosk so routes start at "Bạn đang
          ở đây" instead of "Từ cửa vào" (the default for customer phones). */}
      <label className="mt-5 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
        <input type="checkbox" checked={fixed} onChange={toggleFixed} className="h-5 w-5" />
        Đây là màn hình kiosk cố định đặt tại quầy (chỉ đường tính từ chỗ kiosk thay vì từ cửa vào).
      </label>
    </div>
  );
}
