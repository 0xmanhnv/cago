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

/** Shortest, intuitive route from `start` to `target`: a right-angle ("arrow") path — go vertically
 * to the target's row, then horizontally into it. Earlier this snaked along a drawn aisle (mall-style),
 * which for a small shop looked long/weird; a rural customer expects the direct way. The aisle is still
 * drawn (grey) for context, but the red route is the shortest path. (aisle param kept for the signature.)
 */
export function routeOnFloor(_aisle: Pt[], start: Pt, target: Pt): Pt[] {
  return dedupe([start, { x: start.x, y: target.y }, target]);
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
