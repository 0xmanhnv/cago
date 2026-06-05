# 37 — Kiosk Store Map & Wayfinding

A scaled-down "mall directory" for the Minh Tuyết agri shop: a **fixed** screen → "📍 You are here"
→ the destination zone **blinks** → a **dog-leg route along the main aisle** + a one-line text hint.

## Decisions (owner, 2026-06-02)
- **Place by CATEGORY** (Item Group), not per product. The owner lays out ~8 category blocks; every
  product inherits its category's location. (Per-product overrides are Phase 2.)
- **Wayfinding = a dog-leg route along the aisle**: the owner draws one aisle polyline; the route =
  kiosk → enter the aisle → travel along it → exit at the destination zone.
- **Map editing = drag-and-drop blocks** on a blank canvas (no background image yet — Phase 2).
- **Progressive enhancement**: no map drawn → the kiosk still shows `cago_shelf_location` as text;
  once drawn → a "📍 Xem vị trí" (View location) button appears.

## Key insight
The kiosk is stationary ⇒ the start point is always the kiosk ⇒ **no indoor positioning needed**
(no beacons/wifi). The problem reduces to: draw a route from one fixed point to a category's zone.

## Two start points (fixed kiosk vs customer phone) — added 2026-06-02
Customers may open it on a **phone** (not standing at the counter), so the map stores **two points**:
- `kiosk_x/kiosk_y` — "📍 You are here" (on the fixed in-store kiosk screen).
- `entrance_x/entrance_y` — "🚪 From the entrance" (on a customer phone).
The device chooses via `localStorage["cago_fixed_kiosk"]="1"` (set once on the kiosk tablet via a
button on the map page). Flag set → start at the kiosk; not set → from the entrance. `computeRoute`
takes a `start` param; the start label changes accordingly.

## Coordinate system
Normalised **0–100** on both axes (resolution-independent). `Cago Store Map.width/height` keep the
shop's aspect ratio (e.g. 100×70) for the SVG `viewBox="0 0 width height"`.

## Data model (Frappe)
- **Cago Store Map** (Single):
  - `is_published` Check — show/hide on the kiosk.
  - `width` Float (default 100), `height` Float (default 70).
  - `kiosk_x`, `kiosk_y` Float — the "you are here" pin.
  - `zones` Table → **Cago Map Zone**.
  - `aisle` Table → **Cago Map Aisle Point**.
- **Cago Map Zone** (child): `label` Data (VN, e.g. "Cám chăn nuôi"), `item_group` Link Item Group,
  `x`,`y`,`w`,`h` Float (0–100), `color` Data (hex), `icon` Data (emoji, optional).
- **Cago Map Aisle Point** (child): `x`,`y` Float (ordered by child-table index).

Product ↔ zone matching: the product DTO returns `category = item_group`. Find the zone where
`zone.item_group == product.category` (first match).

## API (`cago/api/storemap.py`)
- `get_store_map()` — `allow_guest=1`. Returns `{published, width, height, kiosk:{x,y}, aisle:[{x,y}],
  zones:[{label,item_group,x,y,w,h,color,icon}]}`. **Public, no sensitive fields** (layout + category
  names only). Used by both the kiosk and the owner editor.
- `save_store_map(data)` — `ensure_owner()`. Upserts the Single + rewrites the child tables.

The route + text hint are computed **client-side** (the kiosk already has the map + the product's
category) ⇒ one `get_store_map` serves everything and works offline.

## Routing (client — `web/src/lib/storemap.ts`)
`computeRoute(map, zone)`:
1. `P` = kiosk; `Z` = destination zone centre.
2. With an `aisle` (≥2 points): project `P`→nearest point `A` on the polyline; project `Z`→`B`.
   Route = `[P, A, …polyline A→B…, B, Z]`.
3. No aisle: a simple dog-leg `[P, (Z.x, P.y), Z]` (go across, then into the zone) — or a straight
   `[P, Z]` labelled "reference map".
`routeHint(map, zone)` → a Vietnamese sentence from the geometry: left/right/straight/behind +
distance (near/mid/far) + zone label. E.g. "Bên phải, đi tới cuối lối đi — kệ Cám 🐔".

## Owner UX — `/owner/map` (`StoreMap` editor)
SVG canvas of the shop. Toolbar:
- **➕ Add zone** → pick an Item Group → a rectangle appears; drag to move, drag a corner to resize;
  tap a block → change label/colour/icon/delete.
- **📍 Set "You are here"** → drag the kiosk pin.
- **🛤 Draw aisle** → tap to add polyline points; drag points; delete.
- **💾 Save** → `save_store_map`. Pointer-events only, no heavy library.
Entered from a tile on the owner home.

## Customer UX — kiosk
- Route `/(kiosk)/map`: shows the whole map; tap a zone → opens that category's product list
  (reuses ProductList filtered by category).
- Product detail page: a **"📍 Xem vị trí"** button (only when the map is published & the category has
  a zone) → opens the map with the destination blinking, the "you are here" pin, the route (dashed +
  animated dot), and a one-line text hint. No matching zone → fall back to showing `shelf_location`.

## Offline / PWA
Cache `get_store_map` and add `/map` to the service-worker cache list.

## Phasing
- **Phase 1 (MVP):** 3 DocTypes + get/save API + drag-and-drop editor + kiosk view + seed one map.
- **Phase 2 (2026-06-02):** multi-floor + editor UX (16 colours + icon grid) + navigation (this version).
- **Later:** per-product location overrides, hand-drawn background image, multi-branch waypoint graph.

## Phase 2 — Multi-floor + UX (done)
The real shop has **2 floors** (ground + basement), each with **shelving on both sides of a central
aisle**, **stairs** connecting floors, and an **entrance** on the ground floor.
- **`Cago Map Floor`** (child): `label`, `level` (higher = upper floor), `stairs_x/_y`. Zone + Aisle
  gain a `floor` field. Store Map gains `floors` + `kiosk_floor` + `entrance_floor`. One shared canvas.
- **Cross-floor `planRoute`**: same floor → start→aisle→zone. Different floor → start→🪜 (start floor),
  then 🪜→zone (destination floor) + "Go to the stairs, **down/up** to {floor}…" (derived from `level`).
- **Editor**: floor tabs, add/remove/rename + level, draggable 🪜 per floor, set kiosk/entrance per
  floor; **16 colours** + **emoji icon grid** (tap, no typing); lock dragging while drawing the aisle;
  stable keys; block writing a (0,0) point when CTM is null; keep a zone even if its label is cleared.
- **Kiosk**: floor tabs (destination marked 🎯), draw only the viewed floor; "zone not marked yet"
  message; seed a 2-floor demo.

## Kiosk navigation — "Back vs Home" (`KioskNavButtons`)
Two distinct intents, **always shown together** on every screen:
- **‹ Quay lại (Back)**: pops the previous screen (history-aware `useKioskNav.goBack`, `cago_nav`
  flag; fallback on a deep entry). Fixed edge case: map → category → Back → **returns to the map**.
- **🏠 Trang chủ (Home)**: one-tap home (for a lost/new customer). Category-switch chips use
  `router.replace` (no history pile-up). Applies to ProductList, ProductDetail, Map, Cart, MyDebt.

## "Need help?" grid — no orphan card
Columns by card count: ≤3 → one row (cols=count, e.g. 3→3); 4 → 2×2; ≥5 → rows of 3 (5→3+2).

## Risks & mitigations
- Owner won't maintain it → category level (stable, ~8 blocks) + optional + quick edit.
- Off by a few metres → "reference map" label.
- Never leaks cost/stock/sensitive data: the map DTO has layout + category names only.
