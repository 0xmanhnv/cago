"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { BackBar, goBackSmart } from "./Shared";
import { toast } from "@/components/ui/toast";
import { COLORS, ICONS, splitStrokes, toPoints, type MapZone, type Pt, type StoreMap } from "@/lib/storemap";

import { PageLoading } from "@/components/ui/Loading";
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type Drag =
  | { kind: "zone" | "zoneResize"; i: number; ox: number; oy: number }
  | { kind: "kiosk" | "entrance" | "stairs" }
  | { kind: "aisle"; i: number }
  | null;

export function StoreMap() {
  const router = useRouter();
  const [map, setMap] = useState<StoreMap | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [floor, setFloor] = useState("");
  const [aisleMode, setAisleMode] = useState(false);
  const [newStroke, setNewStroke] = useState(false); // next aisle tap starts a separate corridor
  const [eraseMode, setEraseMode] = useState(false); // tap a waypoint to delete just that point
  const [snap, setSnap] = useState(true); // snap-to-grid (like draw.io) → straight lines are easy
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);
  const floorRef = useRef("");
  const snapRef = useRef(true);
  const keyRef = useRef(0);
  const nk = () => ++keyRef.current;
  floorRef.current = floor;
  snapRef.current = snap;
  const STEP = 5; // grid step on the 0–100 canvas (20 cols × 14 rows)
  const sv = (v: number) => (snapRef.current ? Math.round(v / STEP) * STEP : v);

  // Undo: snapshot the map before each edit; a drag records ONE snapshot (on its first move,
  // so a tap that selects-but-doesn't-move adds nothing). Cap the stack so memory stays bounded.
  const histRef = useRef<{ map: StoreMap; floor: string }[]>([]);
  const [histLen, setHistLen] = useState(0);
  const dragSnap = useRef<{ map: StoreMap; floor: string } | null>(null);
  const moved = useRef(false);
  const clone = (m: StoreMap) => JSON.parse(JSON.stringify(m)) as StoreMap;
  const recordSnapshot = (snapshot: { map: StoreMap; floor: string }) => {
    histRef.current.push(snapshot);
    if (histRef.current.length > 40) histRef.current.shift();
    setHistLen(histRef.current.length);
  };
  // Snapshot the map AND the active floor (so undoing add/rename-floor can't strand you on a
  // floor that no longer exists). For discrete edits (add/delete/place/…).
  const pushHistory = () => map && recordSnapshot({ map: clone(map), floor });
  const undo = () => {
    const prev = histRef.current.pop();
    if (!prev) return;
    setMap(prev.map);
    setFloor(prev.map.floors.some((f) => f.label === prev.floor) ? prev.floor : prev.map.floors[0]?.label ?? "");
    setHistLen(histRef.current.length);
    setSel(null);
  };
  // Begin a drag: stash a pre-drag snapshot (committed to history only if a move actually happens).
  const startDrag = (d: Drag) => {
    if (map) dragSnap.current = { map: clone(map), floor };
    moved.current = false;
    drag.current = d;
  };

  useEffect(() => {
    frappeCall<StoreMap>("cago.api.storemap.get_store_map", {}, { method: "GET" })
      .then((m) => {
        // Always have at least one floor so the editor has a context (legacy/empty maps).
        if (!m.floors.length) {
          m.floors = [{ label: "Tầng 1", level: 1, stairs: { x: 50, y: 35 } }];
          m.zones.forEach((z) => (z.floor = z.floor || "Tầng 1"));
          m.aisle.forEach((p) => (p.floor = p.floor || "Tầng 1"));
          if (!m.kiosk.floor) m.kiosk.floor = "Tầng 1";
          if (!m.entrance.floor) m.entrance.floor = "Tầng 1";
        }
        m.zones.forEach((z) => (z._k = nk()));
        m.aisle.forEach((p) => (p._k = nk()));
        setMap(m);
        setFloor(m.floors[0].label);
      })
      .catch(() => setMap(null));
    frappeCall<{ item_groups: string[] }>("cago.api.owner.get_product_meta", {}, { method: "GET" })
      .then((m) => setGroups(m.item_groups || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SVG coords from a pointer; null if not laid out (getScreenCTM) so we never write a bogus point.
  const toSvg = (e: { clientX: number; clientY: number }): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const r = p.matrixTransform(ctm.inverse());
    return { x: clamp(r.x, 0, map?.width || 100), y: clamp(r.y, 0, map?.height || 70) };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !map) return;
      const p = toSvg(e);
      if (!p) return;
      if (!moved.current) {
        moved.current = true;
        if (dragSnap.current) recordSnapshot(dragSnap.current); // one undo entry per real drag
      }
      setMap((m) => {
        if (!m) return m;
        const next: StoreMap = { ...m, zones: m.zones.map((z) => ({ ...z })), aisle: m.aisle.map((a) => ({ ...a })), floors: m.floors.map((f) => ({ ...f, stairs: { ...f.stairs } })) };
        if (d.kind === "zone") {
          next.zones[d.i].x = clamp(sv(p.x - d.ox), 0, m.width - next.zones[d.i].w);
          next.zones[d.i].y = clamp(sv(p.y - d.oy), 0, m.height - next.zones[d.i].h);
        } else if (d.kind === "zoneResize") {
          next.zones[d.i].w = clamp(sv(p.x - next.zones[d.i].x), 6, m.width - next.zones[d.i].x);
          next.zones[d.i].h = clamp(sv(p.y - next.zones[d.i].y), 5, m.height - next.zones[d.i].y);
        } else if (d.kind === "kiosk") {
          next.kiosk = { ...next.kiosk, x: sv(p.x), y: sv(p.y) };
        } else if (d.kind === "entrance") {
          next.entrance = { ...next.entrance, x: sv(p.x), y: sv(p.y) };
        } else if (d.kind === "stairs") {
          const fi = next.floors.findIndex((f) => f.label === floorRef.current);
          if (fi >= 0) next.floors[fi].stairs = { x: sv(p.x), y: sv(p.y) };
        } else if (d.kind === "aisle") {
          next.aisle[d.i] = { ...next.aisle[d.i], x: sv(p.x), y: sv(p.y) };
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

  if (!map) return <PageLoading />;

  const upd = (patch: Partial<StoreMap>) => setMap((m) => (m ? { ...m, ...patch } : m));
  const updZone = (i: number, patch: Partial<MapZone>) =>
    setMap((m) => (m ? { ...m, zones: m.zones.map((z, j) => (j === i ? { ...z, ...patch } : z)) } : m));
  const floorObj = map.floors.find((f) => f.label === floor);

  const addFloor = () => {
    pushHistory();
    const label = `Tầng ${map.floors.length + 1}`;
    upd({ floors: [...map.floors, { label, level: map.floors.length + 1, stairs: { x: 50, y: 35 } }] });
    setFloor(label);
  };
  const renameFloor = (oldLabel: string, raw: string) => {
    const label = raw.trim();
    // A floor's identity IS its label (zones/aisle reference it by string). Refuse an empty or
    // duplicate label — otherwise the backend drops the unnamed floor on save and its zones/lối đi
    // are orphaned (lost from every tab + the kiosk). Empty input is simply ignored, not committed.
    if (!label || map.floors.some((f) => f.label === label && f.label !== oldLabel)) return;
    setMap((m) =>
      m
        ? {
            ...m,
            floors: m.floors.map((f) => (f.label === oldLabel ? { ...f, label } : f)),
            zones: m.zones.map((z) => (z.floor === oldLabel ? { ...z, floor: label } : z)),
            aisle: m.aisle.map((p) => (p.floor === oldLabel ? { ...p, floor: label } : p)),
            kiosk: m.kiosk.floor === oldLabel ? { ...m.kiosk, floor: label } : m.kiosk,
            entrance: m.entrance.floor === oldLabel ? { ...m.entrance, floor: label } : m.entrance,
          }
        : m,
    );
    setFloor(label);
  };
  const delFloor = async (label: string) => {
    if (map.floors.length <= 1) return;
    if (!(await confirmDialog(`Xoá ${label} và mọi khu/lối đi trên tầng đó?`, { danger: true, confirmLabel: "Xoá" }))) return;
    pushHistory();
    const floors = map.floors.filter((f) => f.label !== label);
    upd({
      floors,
      zones: map.zones.filter((z) => z.floor !== label),
      aisle: map.aisle.filter((p) => p.floor !== label),
    });
    setFloor(floors[0].label);
    setSel(null);
  };

  const addZone = () => {
    pushHistory();
    const z: MapZone = {
      label: groups[0] || "Khu mới",
      floor,
      item_group: groups[0] || "",
      x: map.width / 2 - 7,
      y: map.height / 2 - 5,
      w: 14,
      h: 10,
      color: COLORS[map.zones.length % COLORS.length],
      icon: "",
      _k: nk(),
    };
    upd({ zones: [...map.zones, z] });
    setSel(map.zones.length);
  };
  const delZone = (i: number) => {
    pushHistory();
    upd({ zones: map.zones.filter((_, j) => j !== i) });
    setSel(null);
  };

  const onCanvasClick = (e: React.PointerEvent) => {
    if (!aisleMode) return;
    const p = toSvg(e);
    if (!p) return;
    pushHistory();
    // b=1 starts a new corridor: explicitly via "Đoạn mới", or implicitly the first point on a floor.
    const first = newStroke || map.aisle.filter((q) => q.floor === floor).length === 0;
    upd({ aisle: [...map.aisle, { x: sv(p.x), y: sv(p.y), floor, _k: nk(), b: first ? 1 : 0 }] });
    setNewStroke(false);
  };

  // Delete a SINGLE waypoint (erase mode) — the corridor reconnects its neighbours. If the removed
  // point started a corridor (b=1), promote the next same-floor point so that corridor still starts
  // fresh instead of merging into the previous one.
  const deleteAislePoint = (i: number) => {
    pushHistory();
    const removed = map.aisle[i];
    const next = map.aisle[i + 1];
    const arr = map.aisle.filter((_, j) => j !== i);
    if (removed?.b && next && !next.b && next.floor === removed.floor) {
      const ni = arr.indexOf(next);
      if (ni >= 0) arr[ni] = { ...arr[ni], b: 1 };
    }
    upd({ aisle: arr });
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await frappeCall("cago.api.storemap.save_store_map", { data: JSON.stringify(map) });
      toast.success("Đã lưu sơ đồ.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu sơ đồ.");
    } finally {
      setBusy(false);
    }
  };

  const selZone = sel != null ? map.zones[sel] : null;
  const aislePts = map.aisle.filter((p) => p.floor === floor);

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="SƠ ĐỒ CỬA HÀNG" />

      {/* floor tabs */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {map.floors.map((f) => (
          <button
            key={f.label}
            onClick={() => { setFloor(f.label); setSel(null); }}
            className={`rounded-lg px-3 py-2 font-bold ${f.label === floor ? "bg-brand text-white" : "bg-slate-200 text-slate-700"}`}
          >
            {f.label}
          </button>
        ))}
        <button onClick={addFloor} className="rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 font-bold text-slate-500">➕ Tầng</button>
      </div>

      {/* One compact tool row so the MAP (the main thing) gets the screen, not the toolbar.
          Setup-y controls (publish / place kiosk+door) moved BELOW the canvas. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={addZone} className="rounded-lg bg-brand px-3 py-2 font-bold text-white">➕ Thêm khu</button>
        <button
          onClick={() => { setAisleMode((v) => !v); setNewStroke(false); setEraseMode(false); }}
          className={`rounded-lg px-3 py-2 font-bold ${aisleMode ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}
        >
          🛤 {aisleMode ? "Đang vẽ" : "Vẽ lối đi"}
        </button>
        {aisleMode && (
          <button
            onClick={() => { setNewStroke(true); setEraseMode(false); }}
            className={`rounded-lg px-3 py-2 font-bold ${newStroke ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800"}`}
            title="Điểm chạm tiếp theo bắt đầu một lối đi riêng (không nối với đoạn đang vẽ)"
          >
            ↳ Đoạn mới
          </button>
        )}
        {aisleMode && (
          <button
            onClick={() => { setEraseMode((v) => !v); setNewStroke(false); }}
            className={`rounded-lg px-3 py-2 font-bold ${eraseMode ? "bg-red-600 text-white" : "bg-red-100 text-red-700"}`}
            title="Bật rồi chạm vào một điểm (chấm cam) để xoá riêng điểm đó"
          >
            🧽 Xoá điểm
          </button>
        )}
        <button onClick={() => setSnap((v) => !v)} className={`rounded-lg px-3 py-2 font-bold ${snap ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-700"}`} title="Bắt dính vào lưới để căn thẳng hàng dễ">
          🧲 Bắt lưới
        </button>
        <button onClick={undo} disabled={histLen === 0} className="rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700 disabled:opacity-40" title="Hoàn tác thay đổi gần nhất">
          ↶ Hoàn tác{histLen ? ` (${histLen})` : ""}
        </button>
        {aislePts.length > 0 && (
          <button
            onClick={async () => {
              if (await confirmDialog(`Xoá toàn bộ lối đi trên ${floor}?`, { danger: true, confirmLabel: "Xoá" })) { pushHistory(); upd({ aisle: map.aisle.filter((p) => p.floor !== floor) }); }
            }}
            className="rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700"
          >
            🧹 Xoá lối
          </button>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${map.width} ${map.height}`}
        onPointerDown={onCanvasClick}
        className="w-full touch-none rounded-xl border-2 border-slate-300 bg-slate-50"
        style={{ aspectRatio: `${map.width} / ${map.height}` }}
      >
        {/* faint alignment grid (draw.io style) — only while snapping, so points line up cleanly */}
        {snap && (
          <g pointerEvents="none">
            {Array.from({ length: Math.floor(map.width / STEP) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * STEP} y1={0} x2={i * STEP} y2={map.height} stroke="#0f172a" strokeOpacity={i % 2 === 0 ? 0.08 : 0.04} strokeWidth={0.2} />
            ))}
            {Array.from({ length: Math.floor(map.height / STEP) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * STEP} x2={map.width} y2={i * STEP} stroke="#0f172a" strokeOpacity={i % 2 === 0 ? 0.08 : 0.04} strokeWidth={0.2} />
            ))}
          </g>
        )}
        {splitStrokes(aislePts).map((stroke, si) =>
          stroke.length >= 2 ? (
            <polyline key={`aisle${si}`} points={toPoints(stroke)} fill="none" stroke="#cbd5e1" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          ) : null,
        )}
        {map.aisle.map((p, i) =>
          p.floor !== floor ? null : (
            <circle
              key={p._k ?? i}
              cx={p.x}
              cy={p.y}
              r={eraseMode ? 2.2 : 1.6}
              fill={eraseMode ? "#dc2626" : "#f59e0b"}
              className={eraseMode ? "cursor-pointer" : "cursor-move"}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (eraseMode) deleteAislePoint(i);
                else startDrag({ kind: "aisle", i });
              }}
            />
          ),
        )}

        {map.zones.map((z, i) => {
          if (z.floor !== floor) return null;
          const cx = z.x + z.w / 2;
          const cy = z.y + z.h / 2;
          return (
            <g key={z._k ?? i}>
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
                  if (aisleMode) return;
                  e.stopPropagation();
                  setSel(i);
                  const p = toSvg(e);
                  if (!p) return;
                  startDrag({ kind: "zone", i, ox: p.x - z.x, oy: p.y - z.y });
                }}
              />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} fill="white" fontWeight="700" pointerEvents="none">
                {z.icon ? `${z.icon} ` : ""}
                {z.label}
              </text>
              <rect
                x={z.x + z.w - 2}
                y={z.y + z.h - 2}
                width={2.4}
                height={2.4}
                fill="#0f172a"
                className="cursor-nwse-resize"
                onPointerDown={(e) => { if (aisleMode) return; e.stopPropagation(); setSel(i); startDrag({ kind: "zoneResize", i, ox: 0, oy: 0 }); }}
              />
            </g>
          );
        })}

        {/* stairs (per floor) */}
        {floorObj && (
          <g className="cursor-move" onPointerDown={(e) => { if (aisleMode) return; e.stopPropagation(); startDrag({ kind: "stairs" }); }}>
            <circle cx={floorObj.stairs.x} cy={floorObj.stairs.y} r={3} fill="#7c3aed" stroke="white" strokeWidth={0.6} />
            <text x={floorObj.stairs.x} y={floorObj.stairs.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} pointerEvents="none">🪜</text>
          </g>
        )}
        {/* entrance + kiosk pins (only on their floor) */}
        {map.entrance.floor === floor && (
          <g className="cursor-move" onPointerDown={(e) => { if (aisleMode) return; e.stopPropagation(); startDrag({ kind: "entrance" }); }}>
            <circle cx={map.entrance.x} cy={map.entrance.y} r={3} fill="#0ea5e9" stroke="white" strokeWidth={0.6} />
            <text x={map.entrance.x} y={map.entrance.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} pointerEvents="none">🚪</text>
          </g>
        )}
        {map.kiosk.floor === floor && (
          <g className="cursor-move" onPointerDown={(e) => { if (aisleMode) return; e.stopPropagation(); startDrag({ kind: "kiosk" }); }}>
            <circle cx={map.kiosk.x} cy={map.kiosk.y} r={3} fill="#16a34a" stroke="white" strokeWidth={0.6} />
            <text x={map.kiosk.x} y={map.kiosk.y} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} pointerEvents="none">📍</text>
          </g>
        )}
      </svg>

      <p className="mt-2 text-sm text-slate-500">
        Kéo khối để di chuyển · kéo góc ↘ chỉnh kích thước · kéo 🪜 (cầu thang) cho khớp vị trí thật.
      </p>

      {/* below the canvas: place kiosk/door + publish toggle (setup, not primary) */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => { pushHistory(); upd({ kiosk: { floor, x: 50, y: map.height - 8 } }); }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">📍 Đặt kiosk ở {floor}</button>
        <button onClick={() => { pushHistory(); upd({ entrance: { floor, x: 50, y: map.height - 4 } }); }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">🚪 Đặt cửa ở {floor}</button>
        <span className="text-slate-400">📍 {map.kiosk.floor || "—"} · 🚪 {map.entrance.floor || "—"}</span>
        <label className="ml-auto flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={map.published} onChange={(e) => upd({ published: e.target.checked })} className="h-5 w-5" />
          Hiển thị trên kiosk
        </label>
      </div>

      {/* floor settings */}
      {floorObj && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-slate-600">Tầng:</span>
          <input value={floorObj.label} onChange={(e) => renameFloor(floorObj.label, e.target.value)} className="w-32 rounded-lg border-2 border-emerald-300 p-1.5" />
          <span className="font-bold text-slate-600">Cao độ</span>
          <input
            type="number"
            value={floorObj.level}
            onChange={(e) => upd({ floors: map.floors.map((f) => (f.label === floor ? { ...f, level: parseInt(e.target.value, 10) || 0 } : f)) })}
            className="w-16 rounded-lg border-2 border-emerald-300 p-1.5 text-center"
          />
          {map.floors.length > 1 && (
            <button onClick={() => delFloor(floorObj.label)} className="rounded-lg border-2 border-red-300 px-2.5 py-1.5 font-bold text-red-600">🗑 Xoá tầng</button>
          )}
        </div>
      )}

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

          <label className="block text-sm font-bold text-slate-600">Biểu tượng</label>
          <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
            <button onClick={() => { pushHistory(); updZone(sel!, { icon: "" }); }} className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 text-sm ${!selZone.icon ? "border-slate-800 bg-slate-100" : "border-slate-200"}`}>✕</button>
            {ICONS.map((ic) => (
              <button key={ic} onClick={() => { pushHistory(); updZone(sel!, { icon: ic }); }} className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 text-lg ${selZone.icon === ic ? "border-slate-800 bg-slate-100" : "border-slate-200"}`}>
                {ic}
              </button>
            ))}
          </div>

          <label className="block text-sm font-bold text-slate-600">Màu</label>
          <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => { pushHistory(); updZone(sel!, { color: c }); }} style={{ background: c }} className={`h-7 w-7 rounded-full ${selZone.color === c ? "ring-2 ring-slate-800 ring-offset-2" : ""}`} />
            ))}
          </div>

          <button
            onClick={async () => { if (await confirmDialog(`Xoá khu "${selZone.label}"?`, { danger: true, confirmLabel: "Xoá" })) delZone(sel!); }}
            className="rounded-lg border-2 border-red-300 px-3 py-2 font-bold text-red-600"
          >
            🗑 Xoá khu
          </button>
        </div>
      )}

      <button onClick={save} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
        {busy ? "Đang lưu..." : "💾 Lưu sơ đồ"}
      </button>
    </div>
  );
}
