"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { BackBar, Ok, Warn } from "./OwnerShared";
import { toPoints, type MapZone, type Pt, type StoreMap } from "@/lib/storemap";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const PALETTE = ["#16a34a", "#f59e0b", "#ef4444", "#0ea5e9", "#84cc16", "#a855f7", "#dc2626", "#64748b"];

type Drag =
  | { kind: "zone" | "zoneResize"; i: number; ox: number; oy: number }
  | { kind: "kiosk" | "entrance" }
  | { kind: "aisle"; i: number }
  | null;

export function StoreMap() {
  const router = useRouter();
  const [map, setMap] = useState<StoreMap | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [aisleMode, setAisleMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);

  useEffect(() => {
    frappeCall<StoreMap>("cago.api.storemap.get_store_map", {}, { method: "GET" }).then(setMap).catch(() => setMap(null));
    frappeCall<{ item_groups: string[] }>("cago.api.owner.get_product_meta", {}, { method: "GET" })
      .then((m) => setGroups(m.item_groups || []))
      .catch(() => {});
  }, []);

  const toSvg = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const r = p.matrixTransform(ctm.inverse());
    return { x: clamp(r.x, 0, map?.width || 100), y: clamp(r.y, 0, map?.height || 70) };
  };

  // Global pointer move/up so a drag keeps tracking outside the element.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !map) return;
      const p = toSvg(e);
      setMap((m) => {
        if (!m) return m;
        const next = { ...m, zones: m.zones.map((z) => ({ ...z })), aisle: m.aisle.map((a) => ({ ...a })) };
        if (d.kind === "zone") {
          next.zones[d.i].x = clamp(p.x - d.ox, 0, m.width - next.zones[d.i].w);
          next.zones[d.i].y = clamp(p.y - d.oy, 0, m.height - next.zones[d.i].h);
        } else if (d.kind === "zoneResize") {
          next.zones[d.i].w = clamp(p.x - next.zones[d.i].x, 6, m.width - next.zones[d.i].x);
          next.zones[d.i].h = clamp(p.y - next.zones[d.i].y, 5, m.height - next.zones[d.i].y);
        } else if (d.kind === "kiosk") {
          next.kiosk = p;
        } else if (d.kind === "entrance") {
          next.entrance = p;
        } else if (d.kind === "aisle") {
          next.aisle[d.i] = p;
        }
        return next;
      });
    };
    const onUp = () => (drag.current = null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.width, map?.height]);

  if (!map) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  const upd = (patch: Partial<StoreMap>) => setMap((m) => (m ? { ...m, ...patch } : m));
  const updZone = (i: number, patch: Partial<MapZone>) =>
    setMap((m) => (m ? { ...m, zones: m.zones.map((z, j) => (j === i ? { ...z, ...patch } : z)) } : m));

  const addZone = () => {
    const z: MapZone = {
      label: groups[0] || "Khu mới",
      item_group: groups[0] || "",
      x: map.width / 2 - 7,
      y: map.height / 2 - 5,
      w: 14,
      h: 10,
      color: PALETTE[map.zones.length % PALETTE.length],
      icon: "",
    };
    upd({ zones: [...map.zones, z] });
    setSel(map.zones.length);
  };
  const delZone = (i: number) => {
    upd({ zones: map.zones.filter((_, j) => j !== i) });
    setSel(null);
  };

  const onCanvasClick = (e: React.PointerEvent) => {
    if (!aisleMode) return; // only add aisle points in aisle mode
    upd({ aisle: [...map.aisle, toSvg(e)] });
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await frappeCall("cago.api.storemap.save_store_map", { data: JSON.stringify(map) });
      setMsg(<Ok>✅ Đã lưu sơ đồ.</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi lưu sơ đồ."}</Warn>);
    } finally {
      setBusy(false);
    }
  };

  const selZone = sel != null ? map.zones[sel] : null;

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="SƠ ĐỒ CỬA HÀNG" />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={addZone} className="rounded-lg bg-brand px-3 py-2 font-bold text-white">➕ Thêm khu</button>
        <button
          onClick={() => setAisleMode((v) => !v)}
          className={`rounded-lg px-3 py-2 font-bold ${aisleMode ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}
        >
          🛤 {aisleMode ? "Đang vẽ lối đi (chạm để thêm điểm)" : "Vẽ lối đi"}
        </button>
        {map.aisle.length > 0 && (
          <button onClick={() => upd({ aisle: [] })} className="rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">Xoá lối đi</button>
        )}
        <label className="ml-auto flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={map.published} onChange={(e) => upd({ published: e.target.checked })} className="h-5 w-5" />
          Hiển thị trên kiosk
        </label>
      </div>

      <p className="mb-2 text-sm text-slate-500">
        Kéo các khối để di chuyển, kéo góc ↘ để chỉnh kích thước. Kéo 📍 (chỗ đặt kiosk) và 🚪 (cửa vào) cho đúng vị trí thật.
      </p>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${map.width} ${map.height}`}
        onPointerDown={onCanvasClick}
        className="w-full touch-none rounded-xl border-2 border-slate-300 bg-slate-50"
        style={{ aspectRatio: `${map.width} / ${map.height}` }}
      >
        {/* aisle */}
        {map.aisle.length >= 2 && <polyline points={toPoints(map.aisle)} fill="none" stroke="#cbd5e1" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {map.aisle.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.6}
            fill="#f59e0b"
            className="cursor-move"
            onPointerDown={(e) => {
              e.stopPropagation();
              drag.current = { kind: "aisle", i };
            }}
          />
        ))}

        {/* zones */}
        {map.zones.map((z, i) => {
          const cx = z.x + z.w / 2;
          const cy = z.y + z.h / 2;
          return (
            <g key={i}>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                rx={1.5}
                fill={z.color}
                fillOpacity={sel === i ? 0.9 : 0.7}
                stroke={sel === i ? "#0f172a" : "white"}
                strokeWidth={sel === i ? 0.8 : 0.4}
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel(i);
                  const p = toSvg(e);
                  drag.current = { kind: "zone", i, ox: p.x - z.x, oy: p.y - z.y };
                }}
              />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} fill="white" fontWeight="700" pointerEvents="none">
                {z.icon ? `${z.icon} ` : ""}
                {z.label}
              </text>
              {/* resize handle */}
              <rect
                x={z.x + z.w - 2}
                y={z.y + z.h - 2}
                width={2.4}
                height={2.4}
                fill="#0f172a"
                className="cursor-nwse-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel(i);
                  drag.current = { kind: "zoneResize", i, ox: 0, oy: 0 };
                }}
              />
            </g>
          );
        })}

        {/* entrance + kiosk pins */}
        <g
          className="cursor-move"
          onPointerDown={(e) => {
            e.stopPropagation();
            drag.current = { kind: "entrance" };
          }}
        >
          <circle cx={map.entrance.x} cy={map.entrance.y} r={3} fill="#0ea5e9" stroke="white" strokeWidth={0.6} />
          <text x={map.entrance.x} y={map.entrance.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} pointerEvents="none">🚪</text>
        </g>
        <g
          className="cursor-move"
          onPointerDown={(e) => {
            e.stopPropagation();
            drag.current = { kind: "kiosk" };
          }}
        >
          <circle cx={map.kiosk.x} cy={map.kiosk.y} r={3} fill="#16a34a" stroke="white" strokeWidth={0.6} />
          <text x={map.kiosk.x} y={map.kiosk.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} pointerEvents="none">📍</text>
        </g>
      </svg>

      {/* selected-zone editor */}
      {selZone && (
        <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
          <div className="mb-2 font-bold">Sửa khu</div>
          <label className="block text-sm font-bold text-slate-600">Tên hiển thị</label>
          <input value={selZone.label} onChange={(e) => updZone(sel!, { label: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2" />
          <label className="block text-sm font-bold text-slate-600">Danh mục (hàng trong khu này)</label>
          <select value={selZone.item_group} onChange={(e) => updZone(sel!, { item_group: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2">
            {["", ...groups].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <div className="mb-2 flex items-center gap-2">
            <input value={selZone.icon} onChange={(e) => updZone(sel!, { icon: e.target.value })} placeholder="🐔" className="w-16 rounded-lg border-2 border-emerald-300 p-2 text-center" />
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => (
                <button key={c} onClick={() => updZone(sel!, { color: c })} style={{ background: c }} className={`h-7 w-7 rounded-full ${selZone.color === c ? "ring-2 ring-slate-800 ring-offset-2" : ""}`} />
              ))}
            </div>
          </div>
          <button
            onClick={async () => {
              if (await confirmDialog(`Xoá khu "${selZone.label}"?`, { danger: true, confirmLabel: "Xoá" })) delZone(sel!);
            }}
            className="rounded-lg border-2 border-red-300 px-3 py-2 font-bold text-red-600"
          >
            🗑 Xoá khu
          </button>
        </div>
      )}

      {msg && <div className="mt-3">{msg}</div>}
      <button onClick={save} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
        {busy ? "Đang lưu..." : "💾 Lưu sơ đồ"}
      </button>
    </div>
  );
}
