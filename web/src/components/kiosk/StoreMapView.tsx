"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { findZone, planRoute, splitStrokes, toPath, toPoints, zoneCenter, type Pt, type StoreMap } from "@/lib/storemap";

// The fixed kiosk tablet carries this flag; customer phones don't. With the flag → route starts
// at the kiosk; without → at the entrance ("từ cửa vào"). It also turns on the web hardening
// (idle reset / no-zoom / fullscreen — see useKioskLockdown).
export const isFixedKiosk = () => typeof window !== "undefined" && window.localStorage?.getItem("cago_fixed_kiosk") === "1";

// Provision the flag from the LAUNCH URL: `?kiosk=1` enables it, `?kiosk=0` clears it. The OS
// kiosk launcher (Fully Kiosk start URL / Chromium --kiosk) owns that URL, and a locked-in shopper
// can't reach the address bar — so unlike an in-page checkbox this can't be flipped by a customer.
// Call once on mount (client-only). Returns the resulting flag.
export function applyKioskUrlFlag(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("kiosk");
  if (v === "1") window.localStorage?.setItem("cago_fixed_kiosk", "1");
  else if (v === "0") window.localStorage?.removeItem("cago_fixed_kiosk");
  return isFixedKiosk();
}

/**
 * Read-only store map (multi-floor). `focusCategory` highlights that category's zone and draws a
 * route to it from the start point (kiosk on the fixed tablet, entrance on a phone), crossing
 * floors via the stairs when needed. `onPickZone` makes zones tappable (browse). Null when unpublished.
 */
export function StoreMapView({
  focusCategory,
  onPickZone,
  mapData,
  fixedKiosk,
}: {
  focusCategory?: string | null;
  onPickZone?: (itemGroup: string) => void;
  mapData?: StoreMap | null; // when the parent already fetched (controlled) — avoids a 2nd fetch
  fixedKiosk?: boolean;
}) {
  const controlled = mapData !== undefined;
  const [selfMap, setSelfMap] = useState<StoreMap | null>(null);
  const [selfFixed, setSelfFixed] = useState(false);
  const [selfLoaded, setSelfLoaded] = useState(false);
  const [viewFloor, setViewFloor] = useState<string>("");
  // Fit the whole map within the screen: measure where the map starts and cap its height to the
  // space left below it (so it never overflows offscreen and the shopper sees the whole layout).
  const svgRef = useRef<SVGSVGElement>(null);
  const [maxH, setMaxH] = useState<number>();

  useEffect(() => {
    setSelfFixed(isFixedKiosk());
    if (controlled) return; // parent supplies the map + fixed flag
    frappeCall<StoreMap>("cago.api.storemap.get_store_map", {}, { method: "GET" })
      .then(setSelfMap)
      .catch(() => setSelfMap(null))
      .finally(() => setSelfLoaded(true));
  }, [controlled]);

  const map = controlled ? mapData ?? null : selfMap;
  const loaded = controlled ? true : selfLoaded;
  const fixed = fixedKiosk !== undefined ? fixedKiosk : selfFixed;
  const start: (Pt & { floor: string }) | null = map ? (fixed ? map.kiosk : map.entrance) : null;
  const startFloor = start?.floor || (map?.floors[0]?.label ?? "");
  const focus = findZone(map, focusCategory);
  const plan = map && focus && start ? planRoute(map, focus, start, startFloor) : null;

  // Default the visible floor to the target's floor (so the route shows immediately).
  useEffect(() => {
    if (!map) return;
    setViewFloor(plan ? plan.targetFloor : startFloor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focusCategory, fixed]);

  // Measure the map's top on screen and on resize; cap its height to the room below (leave ~140px
  // for the legend + buttons under it) so the whole map fits in view, centered.
  useEffect(() => {
    const calc = () => {
      const el = svgRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMaxH(Math.max(220, window.innerHeight - top - 140));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [loaded, map]);

  if (!loaded) return <div className="py-6 text-center text-slate-400">Đang tải sơ đồ...</div>;
  if (!map || !map.published || map.zones.length === 0 || !start) return null;

  const hasFloors = map.floors.length > 0;
  const vf = viewFloor || startFloor;
  const onFloor = (f: string) => !hasFloors || f === vf;
  const zonesOnFloor = map.zones.filter((z) => onFloor(z.floor));
  const aisleOnFloor = map.aisle.filter((p) => onFloor(p.floor));
  const stairs = map.floors.find((f) => f.label === vf)?.stairs;
  const isStartFloor = !hasFloors || vf === startFloor;
  const startIcon = fixed ? "📍" : "🚪";
  const leg = plan?.legs.find((l) => l.floor === vf);
  const focusOnView = focus && (!hasFloors || focus.floor === vf);

  return (
    <div>
      {/* floor switcher */}
      {hasFloors && map.floors.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {map.floors.map((f) => (
            <button
              key={f.label}
              onClick={() => setViewFloor(f.label)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold ${f.label === vf ? "bg-brand text-white" : "bg-slate-200 text-slate-700"} ${plan?.targetFloor === f.label ? "ring-2 ring-red-400" : ""}`}
            >
              {f.label}
              {plan?.targetFloor === f.label ? " 🎯" : ""}
            </button>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${map.width} ${map.height}`}
        className="mx-auto block w-full rounded-2xl border border-emerald-100 bg-slate-50 shadow-sm"
        style={{ aspectRatio: `${map.width} / ${map.height}`, maxWidth: maxH ? `${(maxH * map.width) / map.height}px` : undefined }}
      >
        {splitStrokes(aisleOnFloor).map((stroke, si) =>
          stroke.length >= 2 ? (
            <polyline key={`aisle${si}`} points={toPoints(stroke)} fill="none" stroke="#e2e8f0" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          ) : null,
        )}

        {zonesOnFloor.map((z, i) => {
          const isFocus = focusOnView && z === focus;
          const cx = z.x + z.w / 2;
          const cy = z.y + z.h / 2;
          return (
            <g key={z._k ?? i} className={onPickZone ? "cursor-pointer" : undefined} onClick={() => onPickZone?.(z.item_group)}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={1.5} fill={z.color} fillOpacity={focus && !isFocus ? 0.28 : 0.85} stroke="white" strokeWidth={0.4} />
              {isFocus && (
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={1.5} fill="none" stroke="#0f172a" strokeWidth={0.8}>
                  <animate attributeName="stroke-opacity" values="1;0.2;1" dur="1.1s" repeatCount="indefinite" />
                </rect>
              )}
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={2.8} fill="white" fontWeight="700" pointerEvents="none">
                {z.icon ? `${z.icon} ` : ""}
                {z.label}
              </text>
            </g>
          );
        })}

        {/* route leg on this floor */}
        {leg && leg.route.length >= 2 && (
          <>
            <polyline points={toPoints(leg.route)} fill="none" stroke="#dc2626" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="3 2">
              <animate attributeName="stroke-dashoffset" from="0" to="-10" dur="0.8s" repeatCount="indefinite" />
            </polyline>
            <circle r={1.6} fill="#dc2626">
              <animateMotion dur="3s" repeatCount="indefinite" path={toPath(leg.route)} />
            </circle>
          </>
        )}
        {/* target flag */}
        {focusOnView && (
          <circle cx={zoneCenter(focus!).x} cy={zoneCenter(focus!).y} r={2.4} fill="#dc2626">
            <animate attributeName="r" values="2.4;3.2;2.4" dur="1.1s" repeatCount="indefinite" />
          </circle>
        )}

        {/* stairs marker — tappable to jump to the connected floor (better UX than only the tabs) */}
        {stairs && map.floors.length > 1 && (
          <g
            className="cursor-pointer"
            onClick={() => {
              // Cycle floors in physical (level) order so "tap stairs" goes up/down sensibly.
              const ordered = [...map.floors].sort((a, b) => a.level - b.level);
              const idx = ordered.findIndex((f) => f.label === vf);
              setViewFloor(ordered[(idx + 1) % ordered.length].label);
            }}
          >
            {/* pulsing ring hints it's interactive */}
            <circle cx={stairs.x} cy={stairs.y} r={3.4} fill="none" stroke="#7c3aed" strokeWidth={0.5}>
              <animate attributeName="r" values="3.4;4.6;3.4" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={stairs.x} cy={stairs.y} r={3.2} fill="#7c3aed" stroke="white" strokeWidth={0.6} />
            <text x={stairs.x} y={stairs.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.8} pointerEvents="none">🪜</text>
          </g>
        )}
        {/* start pin (only on its floor) */}
        {isStartFloor && (
          <g>
            <circle cx={start.x} cy={start.y} r={3} fill={fixed ? "#16a34a" : "#0ea5e9"} stroke="white" strokeWidth={0.6} />
            <text x={start.x} y={start.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.8} pointerEvents="none">{startIcon}</text>
          </g>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${fixed ? "bg-brand" : "bg-sky-500"} text-white`}>{startIcon}</span>
          {fixed ? "Bạn đang ở đây" : "Từ cửa vào"}
          {hasFloors ? ` (${startFloor})` : ""}
        </span>
        {map.floors.length > 1 && (
          <span className="flex items-center gap-1.5"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">🪜</span>chạm để đổi tầng</span>
        )}
      </div>

      {focusCategory && !focus && (
        <div className="mt-2 rounded-2xl bg-slate-100 p-3 text-center text-slate-600">Khu này chưa được đánh dấu trên sơ đồ — bác hỏi người bán giúp ạ.</div>
      )}
      {focus && plan && (
        <div className="mt-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-center text-lg font-bold text-red-700">🧭 {plan.instruction}</div>
      )}
    </div>
  );
}
