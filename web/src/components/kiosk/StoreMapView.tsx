"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { computeRoute, findZone, routeHint, toPoints, zoneCenter, type Pt, type StoreMap } from "@/lib/storemap";

// The fixed kiosk tablet sets this once (toggle on the /map page); customer phones don't
// have it. With the flag → route starts at the kiosk; without → at the entrance ("từ cửa vào").
export const isFixedKiosk = () => typeof window !== "undefined" && window.localStorage?.getItem("cago_fixed_kiosk") === "1";

/**
 * Read-only store map. `focusCategory` highlights that category's zone and draws a route to it
 * from the start point (kiosk on the fixed tablet, entrance on a phone). `onPickZone` makes every
 * zone tappable (browse mode). Returns null when no map is published.
 */
export function StoreMapView({
  focusCategory,
  onPickZone,
}: {
  focusCategory?: string | null;
  onPickZone?: (itemGroup: string) => void;
}) {
  const [map, setMap] = useState<StoreMap | null>(null);
  const [fixed, setFixed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFixed(isFixedKiosk());
    frappeCall<StoreMap>("cago.api.storemap.get_store_map", {}, { method: "GET" })
      .then(setMap)
      .catch(() => setMap(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="py-6 text-center text-slate-400">Đang tải sơ đồ...</div>;
  if (!map || !map.published || map.zones.length === 0) return null;

  const start: Pt = fixed ? map.kiosk : map.entrance;
  const startIcon = fixed ? "📍" : "🚪";
  const startLabel = fixed ? "Bạn đang ở đây" : "Từ cửa vào";
  const focus = findZone(map, focusCategory);
  const route = focus ? computeRoute(map, focus, start) : null;

  return (
    <div>
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="w-full rounded-2xl border border-emerald-100 bg-slate-50 shadow-sm" style={{ aspectRatio: `${map.width} / ${map.height}` }}>
        {/* aisle (subtle corridor) */}
        {map.aisle.length >= 2 && (
          <polyline points={toPoints(map.aisle)} fill="none" stroke="#e2e8f0" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* zones */}
        {map.zones.map((z, i) => {
          const isFocus = focus && z === focus;
          const cx = z.x + z.w / 2;
          const cy = z.y + z.h / 2;
          return (
            <g key={i} className={onPickZone ? "cursor-pointer" : undefined} onClick={() => onPickZone?.(z.item_group)}>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                rx={1.5}
                fill={z.color}
                fillOpacity={focus && !isFocus ? 0.28 : 0.85}
                stroke="white"
                strokeWidth={0.4}
              />
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

        {/* route */}
        {route && route.length >= 2 && (
          <>
            <polyline points={toPoints(route)} fill="none" stroke="#dc2626" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="3 2">
              <animate attributeName="stroke-dashoffset" from="0" to="-10" dur="0.8s" repeatCount="indefinite" />
            </polyline>
            {/* moving dot */}
            <circle r={1.6} fill="#dc2626">
              <animateMotion dur="3s" repeatCount="indefinite" path={`M ${route.map((p) => `${p.x} ${p.y}`).join(" L ")}`} />
            </circle>
            {/* target flag */}
            <circle cx={zoneCenter(focus!).x} cy={zoneCenter(focus!).y} r={2.4} fill="#dc2626">
              <animate attributeName="r" values="2.4;3.2;2.4" dur="1.1s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        {/* start pin */}
        <g>
          <circle cx={start.x} cy={start.y} r={3} fill={fixed ? "#16a34a" : "#0ea5e9"} stroke="white" strokeWidth={0.6} />
          <text x={start.x} y={start.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.8} pointerEvents="none">{startIcon}</text>
        </g>
      </svg>

      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${fixed ? "bg-brand" : "bg-sky-500"} text-white`}>{startIcon}</span>
        {startLabel}
      </div>

      {focus && route && (
        <div className="mt-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-center text-lg font-bold text-red-700">
          🧭 {routeHint(focus, start)}
        </div>
      )}
    </div>
  );
}
