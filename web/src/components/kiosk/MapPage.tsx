"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKioskNav } from "@/lib/kioskNav";
import { findZone, planRoute, type StoreMap } from "@/lib/storemap";
import { speak } from "@/lib/kioskUi";
import { StoreMapView, isFixedKiosk } from "./StoreMapView";
import { KioskNavButtons } from "./KioskNavButtons";

export function MapPage() {
  const nav = useKioskNav();
  const [map, setMap] = useState<StoreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [target, setTarget] = useState<string | null>(null); // chosen destination (item_group)

  useEffect(() => {
    setFixed(isFixedKiosk());
    frappeCall<StoreMap>("cago.api.storemap.get_store_map", {}, { method: "GET" })
      .then(setMap)
      .catch(() => setMap(null))
      .finally(() => setLoaded(true));
  }, []);

  const toggleFixed = () => {
    const v = !fixed;
    if (v) window.localStorage?.setItem("cago_fixed_kiosk", "1");
    else window.localStorage?.removeItem("cago_fixed_kiosk");
    window.location.reload();
  };

  const targetZone = findZone(map, target);
  // Read the route aloud (accessibility for older shoppers) — strip emoji so TTS reads cleanly.
  const readRoute = () => {
    if (!map || !targetZone) return;
    const start = fixed ? map.kiosk : map.entrance;
    const plan = planRoute(map, targetZone, start, start.floor);
    speak(plan.instruction.replace(/[^\p{L}\p{N}\s.,/]/gu, " "));
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <KioskNavButtons />
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Sơ đồ cửa hàng</div>
      </div>

      {!loaded ? (
        <div className="py-8 text-center text-slate-400">Đang tải sơ đồ...</div>
      ) : !map || !map.published || map.zones.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-slate-500">Cửa hàng chưa có sơ đồ. Bác hỏi người bán giúp ạ.</div>
      ) : (
        <>
          {/* Directory: pick a destination by name (mall-kiosk style). Tapping a zone on the map
              below does the same. */}
          <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="mb-2 font-bold text-brand-dark">🧭 Bác cần tới đâu? Chạm để xem đường đi:</div>
            {map.floors.map((f) => (
              <div key={f.label} className="mb-2 last:mb-0">
                {map.floors.length > 1 && <div className="mb-1 text-sm font-bold text-slate-500">{f.label}</div>}
                <div className="flex flex-wrap gap-2">
                  {map.zones
                    .filter((z) => z.floor === f.label)
                    .map((z, i) => (
                      <button
                        key={`${z.item_group}-${i}`}
                        onClick={() => setTarget(z.item_group)}
                        className={`rounded-xl px-3 py-2 font-bold ${target === z.item_group ? "ring-2 ring-brand ring-offset-1" : ""}`}
                        style={{ background: z.color, color: "white" }}
                      >
                        {z.icon ? `${z.icon} ` : ""}
                        {z.label}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <StoreMapView focusCategory={target} onPickZone={setTarget} mapData={map} fixedKiosk={fixed} />

          {targetZone ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button onClick={readRoute} className="min-h-touch rounded-xl bg-harvest font-extrabold text-white">🔊 Đọc đường đi</button>
              <button onClick={() => nav.openList(targetZone.item_group)} className="min-h-touch rounded-xl bg-brand font-extrabold text-white">🛒 Xem hàng ở đây</button>
              <button onClick={() => setTarget(null)} className="min-h-touch rounded-xl bg-slate-200 font-extrabold text-slate-700">✖ Chọn nơi khác</button>
            </div>
          ) : (
            <p className="mt-2 text-center text-slate-500">Chạm một khu ở trên hoặc trên sơ đồ để xem đường đi. (Sơ đồ tham khảo)</p>
          )}

          <label className="mt-5 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
            <input type="checkbox" checked={fixed} onChange={toggleFixed} className="h-5 w-5" />
            Đây là màn hình kiosk cố định đặt tại quầy (chỉ đường tính từ chỗ kiosk thay vì từ cửa vào).
          </label>
        </>
      )}
    </div>
  );
}
