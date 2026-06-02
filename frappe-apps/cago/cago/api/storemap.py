# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Store map / wayfinding API.

A fixed-position "shopping-mall directory" for the shop: the kiosk shows where each
category sits and draws a route to it. Public (allow_guest) — the map is only layout +
category names, never price/stock/cost. Owner authors it via save_store_map.

Start point: on the fixed kiosk tablet the route starts at the kiosk pin ("Bạn đang ở
đây"); on a customer's phone it starts at the entrance ("Từ cửa vào"). The client picks
which, so the DTO ships both points.
"""

import json

import frappe
from frappe import _
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
		"kiosk": {"x": flt(doc.kiosk_x), "y": flt(doc.kiosk_y)},
		"entrance": {"x": flt(doc.entrance_x), "y": flt(doc.entrance_y)},
		"zones": [
			{
				"label": z.label,
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
		"aisle": [{"x": flt(p.x), "y": flt(p.y)} for p in doc.aisle],
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
	doc.kiosk_x = flt(kiosk.get("x"))
	doc.kiosk_y = flt(kiosk.get("y"))
	doc.entrance_x = flt(entrance.get("x"))
	doc.entrance_y = flt(entrance.get("y"))

	doc.set("zones", [])
	for z in data.get("zones") or []:
		if not (z or {}).get("label"):
			continue
		doc.append(
			"zones",
			{
				"label": z.get("label"),
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
		doc.append("aisle", {"x": flt((p or {}).get("x")), "y": flt((p or {}).get("y"))})

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return get_store_map()


# Demo layout: a central vertical aisle with category shelves down each side, the kiosk +
# entrance at the front. Run once via:
#   bench --site <site> execute cago.api.storemap.seed_sample_map
_SAMPLE_ZONES = [
	# (label, item_group, x, y, w, h, color, icon)  — coords on a 100 x 70 canvas
	("Cám gà", "Cám gà", 6, 6, 34, 12, "#f59e0b", "🐔"),
	("Cám lợn", "Cám lợn", 6, 22, 34, 12, "#ef4444", "🐷"),
	("Phân vô cơ", "Phân vô cơ", 6, 38, 34, 12, "#0ea5e9", "🌾"),
	("Dụng cụ", "Dụng cụ", 6, 54, 34, 10, "#64748b", "🔧"),
	("Thuốc trừ sâu bệnh", "Thuốc trừ sâu bệnh", 60, 6, 34, 12, "#dc2626", "🧪"),
	("Thuốc cỏ", "Thuốc cỏ", 60, 22, 34, 12, "#16a34a", "🌿"),
	("Phân hữu cơ", "Phân hữu cơ", 60, 38, 34, 12, "#84cc16", "♻️"),
	("Giống lúa", "Giống lúa", 60, 54, 34, 10, "#22c55e", "🌱"),
]
_SAMPLE_AISLE = [(50, 62), (50, 6)]  # central vertical spine


def seed_sample_map(force=False):
	"""Create a demo store map (only if empty, unless force=1)."""
	doc = frappe.get_single("Cago Store Map")
	if doc.zones and not cint(force):
		return {"skipped": "map already has zones"}
	doc.width, doc.height = 100, 70
	doc.kiosk_x, doc.kiosk_y = 50, 60
	doc.entrance_x, doc.entrance_y = 50, 68
	doc.is_published = 1
	doc.set("zones", [])
	for label, grp, x, y, w, h, color, icon in _SAMPLE_ZONES:
		if not frappe.db.exists("Item Group", grp):
			continue
		doc.append("zones", {"label": label, "item_group": grp, "x": x, "y": y, "w": w, "h": h, "color": color, "icon": icon})
	doc.set("aisle", [])
	for x, y in _SAMPLE_AISLE:
		doc.append("aisle", {"x": x, "y": y})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"zones": len(doc.zones), "published": bool(doc.is_published)}
