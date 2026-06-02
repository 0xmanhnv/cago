# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Store map / wayfinding API (multi-floor).

A fixed-position "shopping-mall directory" for the shop: the kiosk shows where each
category sits and draws a route to it — across floors when needed (go to the stairs,
go down/up, then to the shelf). Public (allow_guest) — only layout + category names,
never price/stock/cost. Owner authors it via save_store_map.

Start point: on the fixed kiosk tablet the route starts at the kiosk pin ("Bạn đang ở
đây"); on a customer's phone it starts at the entrance ("Từ cửa vào"). The client picks
which, so the DTO ships both (each with its floor).
"""

import json

import frappe
from frappe.utils import cint, flt

from cago.utils.permissions import ensure_owner


@frappe.whitelist(allow_guest=True)
def get_store_map():
	"""Layout DTO for the kiosk + the owner editor. No sensitive fields."""
	doc = frappe.get_single("Cago Store Map")
	return {
		"published": bool(doc.is_published),
		"width": flt(doc.width) or 100,
		"height": flt(doc.height) or 70,
		"floors": [
			{"label": f.label, "level": cint(f.level), "stairs": {"x": flt(f.stairs_x), "y": flt(f.stairs_y)}}
			for f in doc.floors
		],
		"kiosk": {"floor": doc.kiosk_floor or "", "x": flt(doc.kiosk_x), "y": flt(doc.kiosk_y)},
		"entrance": {"floor": doc.entrance_floor or "", "x": flt(doc.entrance_x), "y": flt(doc.entrance_y)},
		"zones": [
			{
				"label": z.label,
				"floor": z.floor or "",
				"item_group": z.item_group,
				"x": flt(z.x),
				"y": flt(z.y),
				"w": flt(z.w),
				"h": flt(z.h),
				"color": z.color or "#16a34a",
				"icon": z.icon or "",
			}
			for z in doc.zones
		],
		"aisle": [{"floor": p.floor or "", "x": flt(p.x), "y": flt(p.y)} for p in doc.aisle],
	}


@frappe.whitelist()
def save_store_map(data):
	"""Owner upserts the whole map in one call (the editor sends the full layout)."""
	ensure_owner()
	if isinstance(data, str):
		data = json.loads(data)

	doc = frappe.get_single("Cago Store Map")
	doc.is_published = cint(data.get("published"))
	doc.width = flt(data.get("width")) or 100
	doc.height = flt(data.get("height")) or 70
	kiosk = data.get("kiosk") or {}
	entrance = data.get("entrance") or {}
	doc.kiosk_floor = kiosk.get("floor") or ""
	doc.kiosk_x = flt(kiosk.get("x"))
	doc.kiosk_y = flt(kiosk.get("y"))
	doc.entrance_floor = entrance.get("floor") or ""
	doc.entrance_x = flt(entrance.get("x"))
	doc.entrance_y = flt(entrance.get("y"))

	doc.set("floors", [])
	for f in data.get("floors") or []:
		if not (f or {}).get("label"):
			continue
		st = f.get("stairs") or {}
		doc.append("floors", {"label": f.get("label"), "level": cint(f.get("level")), "stairs_x": flt(st.get("x")), "stairs_y": flt(st.get("y"))})

	doc.set("zones", [])
	for z in data.get("zones") or []:
		if not z:
			continue
		doc.append(
			"zones",
			{
				# Keep a zone even if its label was cleared (placeholder) — never silently drop it.
				"label": (z.get("label") or "").strip() or "Khu",
				"floor": z.get("floor") or "",
				"item_group": z.get("item_group"),
				"x": flt(z.get("x")),
				"y": flt(z.get("y")),
				"w": flt(z.get("w")) or 14,
				"h": flt(z.get("h")) or 10,
				"color": z.get("color") or "#16a34a",
				"icon": z.get("icon") or "",
			},
		)

	doc.set("aisle", [])
	for p in data.get("aisle") or []:
		doc.append("aisle", {"floor": (p or {}).get("floor") or "", "x": flt((p or {}).get("x")), "y": flt((p or {}).get("y"))})

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return get_store_map()


# Demo layout matching a 2-floor shop (Tầng 1 + Tầng hầm), each with two shelf rows down the
# sides of a central aisle, a staircase joining them, and the door on Tầng 1. Run once via:
#   bench --site <site> execute cago.api.storemap.seed_sample_map
_SAMPLE_FLOORS = [
	# (label, level, stairs_x, stairs_y)
	("Tầng 1", 1, 50, 12),
	("Tầng hầm", 0, 50, 58),
]
_SAMPLE_ZONES = [
	# (label, floor, item_group, x, y, w, h, color, icon)
	("Dãy 1 · Cám gà", "Tầng 1", "Cám gà", 8, 18, 30, 40, "#f59e0b", "🐔"),
	("Dãy 2 · Cám lợn", "Tầng 1", "Cám lợn", 62, 18, 30, 40, "#ef4444", "🐷"),
	("Dãy 13 · Thuốc sâu", "Tầng hầm", "Thuốc trừ sâu bệnh", 8, 10, 30, 40, "#dc2626", "🧪"),
	("Dãy 14 · Phân bón", "Tầng hầm", "Phân vô cơ", 62, 10, 30, 40, "#0ea5e9", "🌾"),
]
_SAMPLE_AISLE = [
	("Tầng 1", 50, 60),
	("Tầng 1", 50, 14),
	("Tầng hầm", 50, 58),
	("Tầng hầm", 50, 8),
]


def seed_sample_map(force=False):
	"""Create a demo 2-floor store map (only if empty, unless force=1)."""
	doc = frappe.get_single("Cago Store Map")
	if doc.zones and not cint(force):
		return {"skipped": "map already has zones"}
	doc.width, doc.height = 100, 70
	doc.kiosk_floor, doc.kiosk_x, doc.kiosk_y = "Tầng 1", 50, 56
	doc.entrance_floor, doc.entrance_x, doc.entrance_y = "Tầng 1", 50, 64
	doc.is_published = 1
	doc.set("floors", [])
	for label, level, sx, sy in _SAMPLE_FLOORS:
		doc.append("floors", {"label": label, "level": level, "stairs_x": sx, "stairs_y": sy})
	doc.set("zones", [])
	for label, floor, grp, x, y, w, h, color, icon in _SAMPLE_ZONES:
		if not frappe.db.exists("Item Group", grp):
			grp = None
		doc.append("zones", {"label": label, "floor": floor, "item_group": grp, "x": x, "y": y, "w": w, "h": h, "color": color, "icon": icon})
	doc.set("aisle", [])
	for floor, x, y in _SAMPLE_AISLE:
		doc.append("aisle", {"floor": floor, "x": x, "y": y})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"floors": len(doc.floors), "zones": len(doc.zones), "published": True}
