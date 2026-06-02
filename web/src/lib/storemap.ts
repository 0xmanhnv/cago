// Store-map types + client-side wayfinding (multi-floor route + Vietnamese hint).
// Coordinates are normalised 0–100 (width/height keep the store's aspect for the SVG viewBox).

export interface Pt {
  x: number;
  y: number;
  _k?: number; // optional client-only stable key for editor lists (ignored by the backend)
}
export interface AislePt extends Pt {
  floor: string;
}
export interface Floor {
  label: string;
  level: number; // higher = upper floor; used to say "đi lên" vs "đi xuống"
  stairs: Pt;
}
export interface MapZone {
  label: string;
  floor: string;
  item_group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  icon: string;
  _k?: number;
}
export interface StoreMap {
  published: boolean;
  width: number;
  height: number;
  floors: Floor[];
  kiosk: Pt & { floor: string };
  entrance: Pt & { floor: string };
  zones: MapZone[];
  aisle: AislePt[];
}

// Palettes for the owner editor — pick-don't-type, so a non-technical owner never has to know
// hex codes or how to enter an emoji.
export const COLORS = [
  "#16a34a", "#22c55e", "#84cc16", "#eab308", "#f59e0b", "#f97316",
  "#ef4444", "#dc2626", "#ec4899", "#a855f7", "#8b5cf6", "#6366f1",
  "#0ea5e9", "#06b6d4", "#14b8a6", "#64748b",
];
export const ICONS = [
  "🐔", "🐷", "🐮", "🐤", "🦆", "🐟", "🦐", "🌾", "🌱", "🌿", "🍃", "🌽",
  "🥬", "🍚", "♻️", "🧪", "💊", "☠️", "🐀", "🪤", "🔧", "🧰", "🪣", "🧴",
];

export const zoneCenter = (z: MapZone): Pt => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });

/** First zone whose category matches the product's item group (DTO `category`). */
export function findZone(map: StoreMap | null, category?: string | null): MapZone | null {
  if (!map || !category) return null;
  return map.zones.find((z) => z.item_group === category) || null;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function projectOnSeg(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const pt = { x: a.x + t * dx, y: a.y + t * dy };
  return { pt, t, d: dist(p, pt) };
}

function arcLengths(poly: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < poly.length; i++) out.push(out[i - 1] + dist(poly[i - 1], poly[i]));
  return out;
}

function nearestOnPolyline(poly: Pt[], p: Pt): { pt: Pt; s: number } {
  const arc = arcLengths(poly);
  let best = { pt: poly[0], s: 0, d: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const pr = projectOnSeg(p, poly[i], poly[i + 1]);
    if (pr.d < best.d) best = { pt: pr.pt, s: arc[i] + pr.t * (arc[i + 1] - arc[i]), d: pr.d };
  }
  return { pt: best.pt, s: best.s };
}

const samePt = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
function dedupe(pts: Pt[]): Pt[] {
  return pts.filter((p, i) => i === 0 || !samePt(p, pts[i - 1]));
}

/** Route from `start` to `target` along one floor's aisle (mall-style). Falls back to an L-route. */
export function routeOnFloor(aisle: Pt[], start: Pt, target: Pt): Pt[] {
  if (!aisle || aisle.length < 2) return dedupe([start, { x: target.x, y: start.y }, target]);
  const arc = arcLengths(aisle);
  const a = nearestOnPolyline(aisle, start);
  const b = nearestOnPolyline(aisle, target);
  const mids: Pt[] = [];
  for (let i = 0; i < aisle.length; i++) {
    if (arc[i] > Math.min(a.s, b.s) && arc[i] < Math.max(a.s, b.s)) mids.push(aisle[i]);
  }
  if (a.s > b.s) mids.reverse();
  return dedupe([start, a.pt, ...mids, b.pt, target]);
}

export interface RouteLeg {
  floor: string;
  route: Pt[];
  toStairs: boolean; // this leg ends at the stairs (cross-floor first leg)
}
export interface RoutePlan {
  legs: RouteLeg[];
  targetFloor: string;
  crossFloor: boolean;
  instruction: string;
}

const floorAisle = (map: StoreMap, floor: string) =>
  map.floors.length ? map.aisle.filter((p) => p.floor === floor) : map.aisle;

/**
 * Plan a route to a zone, possibly across floors:
 * same floor → start → aisle → zone.
 * other floor → start → aisle → stairs (this floor), then stairs → aisle → zone (target floor),
 *   with a "đi lên/xuống tầng …" instruction.
 */
export function planRoute(map: StoreMap, zone: MapZone, start: Pt, startFloor: string): RoutePlan {
  const target = zoneCenter(zone);
  const tFloor = zone.floor || "";
  const name = `${zone.icon ? zone.icon + " " : ""}${zone.label}`;

  if (!map.floors.length || tFloor === startFloor) {
    const route = routeOnFloor(floorAisle(map, tFloor), start, target);
    return { legs: [{ floor: tFloor, route, toStairs: false }], targetFloor: tFloor, crossFloor: false, instruction: routeHint(zone, start) };
  }

  const sf = map.floors.find((f) => f.label === startFloor);
  const tf = map.floors.find((f) => f.label === tFloor);
  const stairsStart = sf?.stairs || start;
  const stairsTarget = tf?.stairs || target;
  const leg1 = routeOnFloor(floorAisle(map, startFloor), start, stairsStart);
  const leg2 = routeOnFloor(floorAisle(map, tFloor), stairsTarget, target);
  const dir = (tf?.level ?? 0) < (sf?.level ?? 0) ? "xuống" : "lên";
  return {
    legs: [
      { floor: startFloor, route: leg1, toStairs: true },
      { floor: tFloor, route: leg2, toStairs: false },
    ],
    targetFloor: tFloor,
    crossFloor: true,
    instruction: `Đi tới 🪜 cầu thang, ${dir} ${tFloor}, rồi tới khu ${name}.`,
  };
}

/** SVG polyline `points` attribute string. */
export const toPoints = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
/** SVG path string for <animateMotion> along the route. */
export const toPath = (pts: Pt[]) => "M " + pts.map((p) => `${p.x} ${p.y}`).join(" L ");

/**
 * Friendly Vietnamese hint for shoppers who don't read maps (single-floor leg).
 * y grows downward (front of store = larger y), so smaller y = deeper inside.
 */
export function routeHint(zone: MapZone, start: Pt): string {
  const z = zoneCenter(zone);
  const dx = z.x - start.x;
  const dy = z.y - start.y;
  const side = dx > 8 ? "bên phải" : dx < -8 ? "bên trái" : "phía trước";
  const depth = dy < -8 ? "đi vào phía trong" : dy > 8 ? "phía gần cửa" : "";
  const name = `${zone.icon ? zone.icon + " " : ""}${zone.label}`;
  if (!depth && side === "phía trước") return `${name} ở ngay phía trước.`;
  const lead = depth ? `${depth.charAt(0).toUpperCase()}${depth.slice(1)}, ${side}` : `Đi về ${side}`;
  return `${lead} — tới khu ${name}.`;
}
