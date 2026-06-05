"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { useKioskNav } from "@/lib/kioskNav";
import { findZone, planRoute, slugify, type StoreMap } from "@/lib/storemap";
import { speak } from "@/lib/kioskUi";
import { useSession } from "@/lib/session";
import { isInternal } from "@/lib/caps";
import { StoreMapView, isFixedKiosk } from "./StoreMapView";
import { NavButtons } from "./NavButtons";

import { PageLoading } from "@/components/ui/Loading";
export function MapPage() {
  const nav = useKioskNav();
  const router = useRouter();
  const sp = useSearchParams();
  const { boot } = useSession();
  const toSlug = sp.get("to") || ""; // selected destination, kept in the URL so "Quay lại" restores it
  const [map, setMap] = useState<StoreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [target, setTarget] = useState<string | null>(null); // chosen destination (item_group)

  useEffect(() => {
    setFixed(isFixedKiosk());
    frappeCall<StoreMap>("cago.api.storemap.get_store_map", {}, { method: "GET" })
      .then((m) => {
        setMap(m);
        // Restore the selection from ?to= (slug) once the zones are known.
        if (toSlug) {
          const z = m.zones.find((zz) => slugify(zz.item_group) === toSlug);
          if (z) setTarget(z.item_group);
        }
      })
      .catch(() => setMap(null))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick (or clear) a destination AND mirror it into the URL so going to the product list and
  // pressing "Quay lại" comes back with the same zone still selected/routed.
  const pick = (group: string | null) => {
    setTarget(group);
    router.replace(group ? `/map?to=${encodeURIComponent(slugify(group))}` : "/map");
  };

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
        <NavButtons />
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Sơ đồ cửa hàng</div>
      </div>

      {!loaded ? (
        <PageLoading label="Đang tải sơ đồ..." />
      ) : !map || !map.published || map.zones.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-slate-500">Cửa hàng chưa có sơ đồ. Bác hỏi người bán giúp ạ.</div>
      ) : (
        <>
          {/* The map IS the picker — tap a zone to route. (No separate button list: redundant + cluttered.) */}
          {!targetZone && <p className="mb-2 text-center font-bold text-brand-dark">🧭 Chạm vào khu cần đến trên sơ đồ để xem đường đi</p>}

          <StoreMapView focusCategory={target} onPickZone={pick} mapData={map} fixedKiosk={fixed} />

          {targetZone ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button onClick={readRoute} className="min-h-touch rounded-xl bg-harvest font-extrabold text-white">🔊 Đọc đường đi</button>
              <button onClick={() => nav.openList(slugify(targetZone.item_group))} className="min-h-touch rounded-xl bg-brand font-extrabold text-white">🛒 Xem hàng ở đây</button>
              <button onClick={() => pick(null)} className="min-h-touch rounded-xl bg-slate-200 font-extrabold text-slate-700">✖ Chọn nơi khác</button>
            </div>
          ) : (
            <p className="mt-2 text-center text-sm text-slate-400">(Sơ đồ tham khảo)</p>
          )}

          {/* Provisioning control — shown ONLY to a logged-in owner/staff. A customer (guest) never
              sees it, so they can't untick it to bypass the kiosk lockdown. The robust way to
              provision is the launch URL ?kiosk=1 (OS-controlled); this is the in-app convenience. */}
          {isInternal(boot) && (
            <label className="mt-5 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
              <input type="checkbox" checked={fixed} onChange={toggleFixed} className="h-5 w-5" />
              Đây là màn hình kiosk cố định đặt tại quầy (chỉ đường tính từ chỗ kiosk; bật khoá kiosk). Mở bằng <code className="rounded bg-white px-1">?kiosk=1</code> trên máy kiosk.
            </label>
          )}
        </>
      )}
    </div>
  );
}
