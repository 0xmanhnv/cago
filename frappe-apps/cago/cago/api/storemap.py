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

from cago.utils.permissions import ensure_cap, ensure_owner


@frappe.whitelist(allow_guest=True)
def get_store_map():
	"""Layout DTO for the kiosk + the owner editor. No sensitive fields."""
	doc = frappe.get_single("Cago Store Map")
	# A guest (kiosk/public) only sees a PUBLISHED map; an unpublished draft stays private to the
	# logged-in owner editor. (Layout is non-sensitive, but a draft shouldn't surface to customers.)
	if not doc.is_published and frappe.session.user == "Guest":
		return {"published": False}
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
		"aisle": [{"floor": p.floor or "", "x": flt(p.x), "y": flt(p.y), "b": int(p.b or 0)} for p in doc.aisle],
		# category → loại cha, so the kiosk can fall back to the PARENT's zone when a product sits in a
		# child category the owner didn't draw a separate zone for (flat cago_parent taxonomy).
		"parents": {g.name: g.cago_parent for g in frappe.get_all("Item Group", filters={"cago_parent": ["is", "set"]}, fields=["name", "cago_parent"])},
	}


@frappe.whitelist()
def save_store_map(data):
	"""Owner upserts the whole map in one call (the editor sends the full layout)."""
	ensure_cap("settings")
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
		doc.append(
			"aisle",
			{"floor": (p or {}).get("floor") or "", "x": flt((p or {}).get("x")), "y": flt((p or {}).get("y")), "b": 1 if (p or {}).get("b") else 0},
		)

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return get_store_map()


# Demo layout matching a 2-floor shop (Tầng 1 + Tầng hầm), each with two shelf rows down the
# sides of a central aisle, a staircase joining them, and the door on Tầng 1. Run once via:
#   bench --site <site> execute cago.api.storemap.seed_sample_map
_SAMPLE_FLOORS = [
	# (label, level, stairs_x, stairs_y) — stairs at the back-centre of each floor (the shared
	# staircase joining the two stacked floors).
	("Tầng 1", 1, 50, 10),
	("Tầng hầm", 0, 50, 60),
]
# Two shelf columns (left x6 w32, right x62 w32) down each side of a central aisle.
# Tầng 1 = chăn nuôi (chỉ cám gà + cám lợn) + thú y + dụng cụ; Tầng hầm = trồng trọt (phân, BVTV, giống).
_SAMPLE_ZONES = [
	# (label, floor, item_group, x, y, w, h, color, icon)
	("Cám gà", "Tầng 1", "Cám gà", 6, 8, 32, 18, "#f59e0b", "🐔"),
	("Cám lợn", "Tầng 1", "Cám lợn", 6, 30, 32, 18, "#ef4444", "🐷"),
	("Thuốc thú y", "Tầng 1", "Thuốc thú y", 62, 8, 32, 18, "#e11d48", "💉"),
	("Dụng cụ", "Tầng 1", "Dụng cụ", 62, 30, 32, 18, "#64748b", "🔧"),
	("Phân vô cơ", "Tầng hầm", "Phân vô cơ", 6, 6, 32, 13, "#3b82f6", "🧴"),
	("Phân hữu cơ", "Tầng hầm", "Phân hữu cơ", 6, 21, 32, 13, "#84cc16", "♻️"),
	("Thuốc trừ sâu bệnh", "Tầng hầm", "Thuốc trừ sâu bệnh", 6, 36, 32, 13, "#dc2626", "🧪"),
	("Thuốc cỏ", "Tầng hầm", "Thuốc cỏ", 6, 51, 32, 13, "#65a30d", "🌿"),
	("Thuốc chuột", "Tầng hầm", "Thuốc chuột", 62, 6, 32, 13, "#6b7280", "🐀"),
	("Giống lúa", "Tầng hầm", "Giống lúa", 62, 21, 32, 13, "#22c55e", "🌾"),
	("Giống rau", "Tầng hầm", "Giống rau", 62, 36, 32, 13, "#16a34a", "🥬"),
]
# A NETWORK of lối đi: a central vertical corridor down each floor + horizontal branches running in
# the gap (x 38–62) at each shelf row, so the route can reach every zone along drawn aisles.
# Each tuple: (floor, x, y, b) — b=1 starts a new stroke (separate corridor).
_SAMPLE_AISLE = [
	# Tầng 1: central spine + branches to the top row (y17) and bottom row (y39)
	("Tầng 1", 50, 4, 1), ("Tầng 1", 50, 56, 0),
	("Tầng 1", 38, 17, 1), ("Tầng 1", 62, 17, 0),
	("Tầng 1", 38, 39, 1), ("Tầng 1", 62, 39, 0),
	# Tầng hầm: central spine + branches to the 4 shelf rows
	("Tầng hầm", 50, 4, 1), ("Tầng hầm", 50, 64, 0),
	("Tầng hầm", 38, 12, 1), ("Tầng hầm", 62, 12, 0),
	("Tầng hầm", 38, 27, 1), ("Tầng hầm", 62, 27, 0),
	("Tầng hầm", 38, 42, 1), ("Tầng hầm", 62, 42, 0),
	("Tầng hầm", 38, 57, 1), ("Tầng hầm", 62, 57, 0),
]


def _ensure_group(name):
	"""Make sure an Item Group exists so a demo zone maps to a real, browsable category."""
	if not name:
		return None
	if not frappe.db.exists("Item Group", name):
		parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"
		frappe.get_doc({"doctype": "Item Group", "item_group_name": name, "parent_item_group": parent, "is_group": 0}).insert(ignore_permissions=True)
	return name


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
		doc.append("zones", {"label": label, "floor": floor, "item_group": _ensure_group(grp), "x": x, "y": y, "w": w, "h": h, "color": color, "icon": icon})
	doc.set("aisle", [])
	for floor, x, y, b in _SAMPLE_AISLE:
		doc.append("aisle", {"floor": floor, "x": x, "y": y, "b": b})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"floors": len(doc.floors), "zones": len(doc.zones), "published": True}
