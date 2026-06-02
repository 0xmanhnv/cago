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
// Emoji palette for category / store-map / zone icons. Grouped so an agri shop can label its
// real sections: chăn nuôi, thuỷ sản, phân bón (phân/lân/đạm/NPK), giống, cây trồng, thuốc
// BVTV, dụng cụ. No single "fertilizer" emoji exists, so we offer several that read as phân bón
// (bao tải, hạt/granular, bình tưới, túi…) plus crops/livestock/tools.
export const ICONS = [
  // chăn nuôi / thuỷ sản
  "🐔", "🐓", "🐷", "🐮", "🐐", "🐑", "🐤", "🦆", "🥚", "🐟", "🦐", "🦀", "🐌",
  // phân bón (phân / lân / đạm / NPK) + tưới
  "🧴", "🪣", "💧", "🧂", "🫧", "🛢️", "🧱", "⚗️", "🧫",
  // giống / hạt / cây trồng / nông sản
  "🌾", "🌱", "🌿", "🍃", "🪴", "🌽", "🥬", "🥕", "🍅", "🥔", "🍆", "🌶️", "🍓", "🌻", "🥜", "🫘", "🍚",
  // thuốc BVTV / diệt chuột / an toàn
  "🧪", "💊", "🐛", "🦗", "🪰", "🦟", "☠️", "🐀", "🪤", "🚫",
  // dụng cụ / khác
  "🔧", "🧰", "✂️", "🧤", "🪓", "🧹", "📦", "🏷️", "⚖️", "♻️",
];

export const zoneCenter = (z: MapZone): Pt => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });

// Client-side slug for a zone's category, so the map's selected destination can live in the URL
// (?to=) — clean (no Vietnamese) and self-consistent (we both make and resolve it here).
export const slugify = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** First zone whose category matches the product's item group (DTO `category`). */
export function findZone(map: StoreMap | null, category?: string | null): MapZone | null {
  if (!map || !category) return null;
  return map.zones.find((z) => z.item_group === category) || null;
}

const samePt = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
function dedupe(pts: Pt[]): Pt[] {
  return pts.filter((p, i) => i === 0 || !samePt(p, pts[i - 1]));
}

type Rect = { x: number; y: number; w: number; h: number };
const MARGIN = 1.2; // clearance around zone boxes (0–100 space) so the route skirts, not grazes

const inRect = (p: Pt, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

function segCrosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (o(a, b, c) > 0) !== (o(a, b, d) > 0) && (o(c, d, a) > 0) !== (o(c, d, b) > 0);
}

// Does segment a→b pass through rectangle r's interior?
function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  if (inRect(a, r) || inRect(b, r) || inRect({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r)) return true;
  const c = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) if (segCrosses(a, b, c[i], c[(i + 1) % 4])) return true;
  return false;
}

const visible = (a: Pt, b: Pt, obs: Rect[]) => !obs.some((r) => segHitsRect(a, b, r));

/** Route from `start` to a zone: the SHORTEST walkable path that doesn't cut through any shelf box.
 * The open floor between shelves is walkable, so a straight line is used whenever the way is clear;
 * otherwise it routes AROUND the boxes (visibility graph + Dijkstra over their expanded corners).
 * The start/target's own zone isn't treated as a wall (you must leave/enter it). The drawn aisle is
 * decorative — forcing the route onto it only created detours/overshoot, so routing ignores it. */
export function routeOnFloor(zones: Rect[], start: Pt, target: Pt): Pt[] {
  const obs = zones.filter((z) => !inRect(start, z) && !inRect(target, z));
  if (visible(start, target, obs)) return dedupe([start, target]);
  const nodes: Pt[] = [start, target];
  for (const r of obs) {
    nodes.push(
      { x: r.x - MARGIN, y: r.y - MARGIN },
      { x: r.x + r.w + MARGIN, y: r.y - MARGIN },
      { x: r.x + r.w + MARGIN, y: r.y + r.h + MARGIN },
      { x: r.x - MARGIN, y: r.y + r.h + MARGIN },
    );
  }
  const pts = nodes.filter((n, i) => i < 2 || !obs.some((r) => inRect(n, r))); // drop corners stuck in another box
  const N = pts.length;
  const adj: { to: number; w: number }[][] = pts.map(() => []);
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++)
      if (visible(pts[i], pts[j], obs)) {
        const w = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        adj[i].push({ to: j, w });
        adj[j].push({ to: i, w });
      }
  const D = Array(N).fill(Infinity);
  const prev = Array(N).fill(-1);
  const seen = Array(N).fill(false);
  D[0] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let k = 0; k < N; k++) if (!seen[k] && D[k] < best) ((best = D[k]), (u = k));
    if (u === -1 || u === 1) break;
    seen[u] = true;
    for (const e of adj[u]) if (D[u] + e.w < D[e.to]) ((D[e.to] = D[u] + e.w), (prev[e.to] = u));
  }
  if (D[1] === Infinity) return dedupe([start, target]);
  const path: Pt[] = [];
  for (let cur = 1; cur !== -1; cur = prev[cur]) path.unshift(pts[cur]);
  return dedupe(path);
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

// Zone boxes on a floor, as obstacles for the no-aisle fallback router.
const zonesOnFloor = (map: StoreMap, floor: string): Rect[] =>
  (map.floors.length ? map.zones.filter((z) => z.floor === floor) : map.zones).map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h }));


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
    const route = routeOnFloor(zonesOnFloor(map, tFloor), start, target);
    return { legs: [{ floor: tFloor, route, toStairs: false }], targetFloor: tFloor, crossFloor: false, instruction: routeHint(zone, start) };
  }

  const sf = map.floors.find((f) => f.label === startFloor);
  const tf = map.floors.find((f) => f.label === tFloor);
  const stairsStart = sf?.stairs || start;
  const stairsTarget = tf?.stairs || target;
  const leg1 = routeOnFloor(zonesOnFloor(map, startFloor), start, stairsStart);
  const leg2 = routeOnFloor(zonesOnFloor(map, tFloor), stairsTarget, target);
  const tl = tf?.level ?? 0;
  const sl = sf?.level ?? 0;
  const dir = tl < sl ? `xuống ${tFloor}` : tl > sl ? `lên ${tFloor}` : `sang ${tFloor}`;
  return {
    legs: [
      { floor: startFloor, route: leg1, toStairs: true },
      { floor: tFloor, route: leg2, toStairs: false },
    ],
    targetFloor: tFloor,
    crossFloor: true,
    instruction: `Đi tới 🪜 cầu thang, ${dir}, rồi tới khu ${name}.`,
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
