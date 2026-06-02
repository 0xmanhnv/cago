// Store-map types + client-side wayfinding (route + Vietnamese hint).
// Coordinates are normalised 0–100 (width/height keep the store's aspect for the SVG viewBox).

export interface Pt {
  x: number;
  y: number;
}
export interface MapZone {
  label: string;
  item_group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  icon: string;
}
export interface StoreMap {
  published: boolean;
  width: number;
  height: number;
  kiosk: Pt;
  entrance: Pt;
  zones: MapZone[];
  aisle: Pt[];
}

export const zoneCenter = (z: MapZone): Pt => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });

/** First zone whose category matches the product's item group (DTO `category`). */
export function findZone(map: StoreMap | null, category?: string | null): MapZone | null {
  if (!map || !category) return null;
  return map.zones.find((z) => z.item_group === category) || null;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// Project p onto segment a→b; return the closest point + how far along (t in 0..1).
function projectOnSeg(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const pt = { x: a.x + t * dx, y: a.y + t * dy };
  return { pt, t, d: dist(p, pt) };
}

// Cumulative arc length up to each vertex of the polyline.
function arcLengths(poly: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < poly.length; i++) out.push(out[i - 1] + dist(poly[i - 1], poly[i]));
  return out;
}

// Closest point on the whole polyline + its arc-length position.
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

/**
 * Route from `start` to the zone, hugging the main aisle (mall-style orthogonal-ish path):
 * start → enter aisle → walk along aisle → exit aisle → into the zone.
 * With no aisle drawn, fall back to a simple L-route (horizontal then into the zone).
 */
export function computeRoute(map: StoreMap, zone: MapZone, start: Pt): Pt[] {
  const target = zoneCenter(zone);
  if (!map.aisle || map.aisle.length < 2) {
    const elbow = { x: target.x, y: start.y };
    return dedupe([start, elbow, target]);
  }
  const arc = arcLengths(map.aisle);
  const a = nearestOnPolyline(map.aisle, start); // enter aisle
  const b = nearestOnPolyline(map.aisle, target); // exit aisle
  const forward = a.s <= b.s;
  const mids: Pt[] = [];
  for (let i = 0; i < map.aisle.length; i++) {
    if (arc[i] > Math.min(a.s, b.s) && arc[i] < Math.max(a.s, b.s)) mids.push(map.aisle[i]);
  }
  if (!forward) mids.reverse();
  return dedupe([start, a.pt, ...mids, b.pt, target]);
}

function dedupe(pts: Pt[]): Pt[] {
  return pts.filter((p, i) => i === 0 || !samePt(p, pts[i - 1]));
}

/** SVG polyline `points` attribute string. */
export const toPoints = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

/**
 * Friendly Vietnamese turn-by-turn-ish hint for shoppers who don't read maps.
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
