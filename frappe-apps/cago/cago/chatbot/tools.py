# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Tool registry the LLM can call to read REAL store data on demand.

Instead of stuffing a guessed-at retrieval result into the prompt and hoping it covered the
question, the model calls these tools to look things up itself: list categories, search
products, open a product, find where it sits, see best-sellers. Every tool goes through the
same role-filtered DTO layer (cago.utils.dto / retrieval / storefacts), so a staff/customer
session can never surface cost, margin or supplier data — the tools simply cannot read those
fields. Chemical-dosage questions are refused deterministically in the orchestrator BEFORE the
tool loop ever runs, so no tool can be used to extract invented dosage/mixing advice.

Each tool returns a compact human-readable string for the model AND the role-safe DTOs it
touched (so the orchestrator can render real product cards in the UI). See docs/27.
"""

from __future__ import annotations

import frappe

from cago.utils import dto

from . import retrieval, storefacts

_MAX = 8  # cap rows per tool so the context stays small and cheap


def _fmt(p):
	"""One compact line per product — role-safe fields only (the DTO already excludes cost)."""
	bits = [f"{'⭐ ' if p.get('recommended') else ''}{p.get('display_name')} [{p.get('item_code')}]"]
	bits.append(f"giá {p.get('price_text') or 'chưa có'}")
	bits.append(f"tồn: {p.get('stock_status') or 'Còn hàng'}")
	if p.get("use_cases"):
		bits.append(f"dùng cho {p['use_cases']}")
	if p.get("category"):
		bits.append(f"loại {p['category']}")
	return " — ".join(bits)


# ---------------------------------------------------------------------------- tool bodies
# Each returns (content_text, [dto, ...]). DTOs feed the UI product cards; text feeds the model.


def _list_categories(role, args):
	from cago.api.kiosk import category_tree

	public_only = role not in ("staff", "owner")
	cats = [c for c in (category_tree(public_only=public_only) or []) if c.get("count")]
	if not cats:
		return "Cửa hàng chưa có loại hàng nào có sẵn.", []
	lines = ["Các loại hàng cửa hàng đang bán:"]
	for c in cats:
		kids = ", ".join(k.get("category") for k in (c.get("children") or [])) if c.get("children") else ""
		lines.append(f"- {c.get('category')} ({c.get('count')} sản phẩm)" + (f" — gồm: {kids}" if kids else ""))
	return "\n".join(lines), []


def _search_products(role, args):
	q = (args.get("query") or "").strip()
	if not q:
		return "Thiếu từ khoá tìm kiếm.", []
	products = retrieval.search(role, q, k=_MAX)
	if not products:
		return f"Không tìm thấy sản phẩm nào khớp '{q}'.", []
	return "\n".join(_fmt(p) for p in products), products


def _list_in_category(role, args):
	cat = (args.get("category") or "").strip()
	if not cat:
		return "Thiếu tên loại hàng.", []
	audience = role if role in ("staff", "owner") else "public"
	public_only = role not in ("staff", "owner")
	# Accept a slug or the Vietnamese name; resolve a close category match if needed.
	if not frappe.db.exists("Item Group", cat):
		match = frappe.get_all("Item Group", filters={"name": ["like", f"%{cat}%"]}, pluck="name", limit=1)
		if match:
			cat = match[0]
	products = dto.list_dtos(None, audience=audience, public_only=public_only, category=cat, limit=_MAX)
	if not products:
		return f"Loại '{cat}' chưa có sản phẩm có sẵn.", []
	return f"Sản phẩm trong loại {cat}:\n" + "\n".join(_fmt(p) for p in products), products


def _get_product(role, args):
	code = (args.get("item_code") or "").strip()
	public_only = role not in ("staff", "owner")
	p = retrieval._focus_product(role, code, public_only)
	if not p:
		# Maybe they passed a name — try a search and take the top hit.
		hits = retrieval.search(role, code, k=1)
		if not hits:
			return f"Không tìm thấy sản phẩm '{code}'.", []
		p = hits[0]
	lines = [_fmt(p)]
	if p.get("public_description"):
		lines.append(f"Mô tả: {p['public_description']}")
	if p.get("sale_units"):
		lines.append("Quy cách: " + " · ".join(
			f"{u.get('label') or u.get('uom')}: {u.get('price_text')}" for u in p["sale_units"]
		))
	if p.get("is_chemical") and p.get("safety_notes"):
		lines.append(f"An toàn: {p['safety_notes']}")
	return "\n".join(lines), [p]


def _find_location(role, args):
	code = (args.get("item_code") or "").strip()
	if not frappe.db.exists("Item", code):
		hits = retrieval.search(role, code, k=1)
		if hits:
			code = hits[0].get("item_code")
	loc = storefacts.locate(code) if code else None
	if not loc:
		return "Chưa có dữ liệu vị trí cho sản phẩm này; mời khách hỏi người bán hoặc xem 'Sơ đồ cửa hàng'.", []
	parts = []
	if loc.get("floor"):
		parts.append(f"tầng/khu: {loc['floor']}")
	if loc.get("zone"):
		parts.append(f"khu {loc['zone']}")
	if loc.get("shelf"):
		parts.append(f"kệ {loc['shelf']}")
	return "Vị trí: " + ", ".join(parts), []


def _best_sellers(role, args):
	codes = dto.best_seller_codes()[:_MAX]
	if not codes:
		return "Chưa có dữ liệu bán chạy (chưa đủ lịch sử bán hàng).", []
	cards = dto.list_dtos(None, audience="public", public_only=True, codes=codes, limit=len(codes))
	order = {c: i for i, c in enumerate(codes)}
	cards = sorted(cards, key=lambda x: order.get(x.get("item_code"), 999))
	return "Sản phẩm bán chạy nhất (30 ngày gần đây):\n" + "\n".join(_fmt(p) for p in cards), cards


_REGISTRY = {
	"list_categories": (_list_categories, "Liệt kê tất cả loại hàng (danh mục) cửa hàng đang bán kèm số lượng sản phẩm. Dùng khi khách hỏi 'cửa hàng bán những gì', 'có những loại nào'.", {"type": "object", "properties": {}}),
	"search_products": (_search_products, "Tìm sản phẩm theo từ khoá (tên, công dụng, con vật, cây trồng, màu bao...). Dùng cho hầu hết câu hỏi về một/nhiều sản phẩm cụ thể.", {"type": "object", "properties": {"query": {"type": "string", "description": "Từ khoá tiếng Việt, ví dụ 'cám gà', 'thuốc trừ sâu lúa', 'phân npk'"}}, "required": ["query"]}),
	"list_products_in_category": (_list_in_category, "Liệt kê sản phẩm trong một loại hàng cụ thể.", {"type": "object", "properties": {"category": {"type": "string", "description": "Tên loại hàng, ví dụ 'Cám chăn nuôi'"}}, "required": ["category"]}),
	"get_product": (_get_product, "Xem chi tiết một sản phẩm (giá, tồn, quy cách, mô tả, an toàn) theo mã hoặc tên.", {"type": "object", "properties": {"item_code": {"type": "string", "description": "Mã sản phẩm (item_code) hoặc tên sản phẩm"}}, "required": ["item_code"]}),
	"find_location": (_find_location, "Tra vị trí sản phẩm trong cửa hàng (tầng, khu, kệ) từ sơ đồ cửa hàng. Dùng khi khách hỏi 'để ở đâu', 'lấy ở chỗ nào'.", {"type": "object", "properties": {"item_code": {"type": "string", "description": "Mã hoặc tên sản phẩm"}}, "required": ["item_code"]}),
	"best_sellers": (_best_sellers, "Liệt kê các sản phẩm bán chạy nhất gần đây. Dùng khi khách hỏi 'bán chạy', 'nhiều người mua', 'loại nào phổ biến'.", {"type": "object", "properties": {}}),
}


def openai_schemas():
	return [
		{"type": "function", "function": {"name": name, "description": desc, "parameters": params}}
		for name, (_fn, desc, params) in _REGISTRY.items()
	]


def anthropic_schemas():
	return [
		{"name": name, "description": desc, "input_schema": params}
		for name, (_fn, desc, params) in _REGISTRY.items()
	]


def run_tool(role, name, args):
	"""Execute a tool by name. Returns (content_text, [role_safe_dto, ...]).
	Unknown names / internal errors return a safe message (never raise into the loop)."""
	fn = (_REGISTRY.get(name) or (None,))[0]
	if not fn:
		return f"Công cụ '{name}' không tồn tại.", []
	try:
		return fn(role, args or {})
	except Exception:
		frappe.log_error(frappe.get_traceback(), f"cago chatbot tool {name}")
		return "Xin lỗi, không tra được dữ liệu lúc này.", []
