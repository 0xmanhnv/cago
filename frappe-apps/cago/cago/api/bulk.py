# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Bulk product entry / stock-in for a non-technical owner.

Every input method (typed/pasted lines, a photo of a paper list or supplier invoice, or
picking existing products) is turned into the SAME list of rows {name, qty, unit, cost,
sell, item_code?} — the frontend shows them in one editable review table, then calls
bulk_receive() to commit (restock matched items + create new ones), once, with audit.

Parsing is best-effort: the owner always reviews/edits before anything is written.
"""

import base64
import json
import re

import frappe
from frappe import _
from frappe.utils import flt

from cago.api.owner import create_product
from cago.api.purchasing import receive_stock
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils.permissions import ensure_owner

UNIT_WORDS = {
	"bao": "Bao", "gói": "Gói", "goi": "Gói", "chai": "Chai", "kg": "Kg", "cái": "Cái",
	"cai": "Cái", "túi": "Túi", "tui": "Túi", "lọ": "Lọ", "lo": "Lọ", "bình": "Bình",
	"binh": "Bình", "can": "Can", "thùng": "Thùng", "thung": "Thùng", "hộp": "Hộp",
	"hop": "Hộp", "vỉ": "Vỉ", "vi": "Vỉ", "yến": "Yến", "yen": "Yến", "tạ": "Tạ",
	"ta": "Tạ", "tấn": "Tấn", "tan": "Tấn", "gói": "Gói",
}
_WORD_NUM = {"không": 0, "một": 1, "hai": 2, "ba": 3, "bốn": 4, "năm": 5, "sáu": 6, "bảy": 7, "tám": 8, "chín": 9, "mười": 10, "chục": 10}


def _parse_money(tok: str) -> float:
	"""'250k'→250000, '2tr5'→2500000, '2tr'→2000000, '250.000'→250000, '15000'→15000."""
	tok = (tok or "").strip().lower().replace("đ", "").replace(" ", "")
	if not tok:
		return 0
	m = re.match(r"^(\d+(?:[.,]\d+)?)tr(\d*)$", tok)  # 2tr5, 2tr
	if m:
		whole = float(m.group(1).replace(",", "."))
		frac = m.group(2)
		val = whole * 1_000_000
		if frac:
			val += int(frac) * (10 ** (6 - len(frac)))
		return val
	m = re.match(r"^(\d+(?:[.,]\d+)?)(k|ngàn|nghìn|ngan|nghin)$", tok)  # 250k
	if m:
		return float(m.group(1).replace(",", ".")) * 1000
	if re.match(r"^\d{1,3}(\.\d{3})+$", tok):  # 250.000 grouped
		return float(tok.replace(".", ""))
	digits = re.sub(r"[^\d]", "", tok)
	return float(digits) if digits else 0


def _parse_qty(tok: str) -> float:
	tok = (tok or "").strip().lower()
	if tok in _WORD_NUM:
		return _WORD_NUM[tok]
	tok = tok.replace(",", ".")
	return flt(tok) if re.match(r"^\d+(\.\d+)?$", tok) else 0


def parse_line(line: str) -> dict | None:
	"""One free-text line → {name, qty, unit, cost} best-effort. Returns None for blanks."""
	raw = (line or "").strip(" -*•\t")
	if not raw:
		return None
	low = raw.lower()
	qty, unit, cost = 0.0, "", 0.0

	# unit + the number right before it → quantity (e.g. "3 bao", "5 gói")
	um = re.search(r"(\d+(?:[.,]\d+)?|\b(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\b)\s*(" + "|".join(map(re.escape, UNIT_WORDS)) + r")\b", low)
	if um:
		qty = _parse_qty(um.group(1))
		unit = UNIT_WORDS.get(um.group(2), "")

	# price: a token with k/tr/nghìn, a grouped number, or a bare 4+ digit run that is NOT glued to
	# letters (so product codes like "OM5451", "DT568", "NPK20" keep their digits).
	PRICE_RE = r"\d+(?:[.,]\d+)?\s*tr\d*|\d+(?:[.,]\d+)?\s*(?:k|ngàn|nghìn)|\d{1,3}(?:\.\d{3})+|(?<![A-Za-zÀ-ỹ])\d{4,}(?![A-Za-zÀ-ỹ])"
	pm = re.search(r"(" + PRICE_RE + r")", low)
	if pm:
		cost = _parse_money(pm.group(1))

	# name = line with the matched qty/unit and price stripped out
	name = raw
	if um:
		name = name[: um.start()] + name[um.end():]
	if pm:
		name = re.sub(PRICE_RE, "", name, flags=re.IGNORECASE)
	# if no unit matched, a leading bare number is likely the qty
	if not qty:
		lead = re.match(r"^\s*(\d+(?:[.,]\d+)?)\b", name)
		if lead:
			qty = flt(lead.group(1).replace(",", "."))
			name = name[lead.end():]
	name = re.sub(r"\s{2,}", " ", name).strip(" -·,.")
	if not name:
		return None
	return {"name": name, "qty": qty or 1, "unit": unit, "cost": cost}


def _match(name: str) -> dict | None:
	"""Suggest an existing Item for a name — only on a STRONG signal, so the review table never
	silently restocks the wrong product. Exact (case-insensitive) wins; otherwise accept a
	contains-match only when the candidate name is close in length to the query (not a generic
	stem like 'Cám' matching 'Cám cò'). Ambiguous → no suggestion (treated as a new product)."""
	q = (name or "").strip().lower()
	if len(q) < 2:
		return None
	rows = frappe.db.sql(
		"""select name, cago_display_name, item_name, stock_uom
		   from `tabItem`
		   where disabled = 0 and (lower(cago_display_name) like %(l)s or lower(item_name) like %(l)s or lower(cago_local_names) like %(l)s)
		   order by length(coalesce(cago_display_name, item_name)) asc limit 8""",
		{"l": f"%{q}%"},
		as_dict=True,
	)
	def pick(r):
		return {"item_code": r.name, "display_name": r.cago_display_name or r.item_name, "stock_uom": r.stock_uom}

	for r in rows:  # exact match on display or item name
		if (r.cago_display_name or "").strip().lower() == q or (r.item_name or "").strip().lower() == q:
			return pick(r)
	for r in rows:  # contains, but only if lengths are close (avoid a short generic stem)
		nm = (r.cago_display_name or r.item_name or "").strip().lower()
		if q in nm and len(nm) <= len(q) + 6:
			return pick(r)
	return None


def _row(parsed: dict) -> dict:
	"""Attach a match suggestion to a parsed {name, qty, unit, cost}."""
	m = _match(parsed.get("name"))
	return {
		"name": parsed.get("name"),
		"qty": flt(parsed.get("qty")) or 1,
		"unit": parsed.get("unit") or (m.get("stock_uom") if m else ""),
		"cost": flt(parsed.get("cost")),
		"sell": flt(parsed.get("sell")),
		"item_code": m["item_code"] if m else None,
		"matched_name": m["display_name"] if m else None,
		"is_new": not m,
	}


@frappe.whitelist()
def parse_text(text):
	"""Typed/pasted lines → review rows (with match suggestions)."""
	ensure_owner()
	rows = [_row(p) for line in (text or "").splitlines() if (p := parse_line(line))]
	return rows


@frappe.whitelist()
def parse_image(file_url):
	"""Photo of a paper list / supplier invoice → review rows, via the configured vision LLM."""
	ensure_owner()
	content = _read_file(file_url)
	mime = _sniff_mime(content)
	if mime == "image/heic":
		frappe.throw(_("Ảnh dạng HEIC (iPhone) chưa hỗ trợ. Bác chụp lại ở dạng JPG, hoặc gõ tay danh sách."))
	items = _vision_extract(base64.b64encode(content).decode(), mime)
	rows = []
	for it in items:
		rows.append(_row({
			"name": (it.get("name") or "").strip(),
			"qty": it.get("qty") or 1,
			"unit": it.get("unit") or "",
			"cost": _parse_money(str(it.get("price") or it.get("cost") or "")) if not isinstance(it.get("price"), (int, float)) else flt(it.get("price")),
		}))
	return [r for r in rows if r["name"]]


def _read_file(file_url):
	# Resolve via the File doc (not a raw path) so a crafted file_url can't read arbitrary files.
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name:
		frappe.throw(_("Không tìm thấy ảnh vừa tải."))
	return frappe.get_doc("File", name).get_content()


def _sniff_mime(content: bytes) -> str:
	"""Detect image type from magic bytes (extension lies — iPhone HEIC, etc.)."""
	if content[:8].startswith(b"\x89PNG"):
		return "image/png"
	if content[:3] == b"\xff\xd8\xff":
		return "image/jpeg"
	if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
		return "image/webp"
	if content[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1", b"ftypmsf1"):
		return "image/heic"
	return "image/jpeg"  # default — most phone cameras


_VISION_PROMPT = (
	"Bạn đọc bảng kê / hoá đơn / danh sách hàng vật tư nông nghiệp trong ảnh (có thể viết tay). "
	"Trả về DUY NHẤT một mảng JSON, mỗi sản phẩm là một phần tử: "
	'{"name": tên sản phẩm (cột Tên sản phẩm; nếu có Mã sản phẩm thì thêm vào cuối tên trong ngoặc), '
	'"qty": số lượng (lấy cột Số lượng / Số bao, là SỐ), '
	'"unit": đơn vị bán (Bao/Gói/Kg/Chai/Cái...; nếu bán theo bao thì ghi "Bao"), '
	'"price": GIÁ NHẬP cho MỖI đơn vị bán (số nguyên, không dấu chấm)}. '
	"QUY TẮC GIÁ: nếu hoá đơn ghi giá theo Kg cùng Số bao và Thành tiền, hãy tính giá mỗi bao = "
	"Thành tiền ÷ Số lượng bao. Nếu chỉ có đơn giá theo đơn vị bán thì dùng luôn. "
	"Hoá đơn viết tay thường ghi giá TẮT theo nghìn đồng (vd '270' nghĩa là 270.000, '4.5' là 4.500); "
	"nếu hợp lý hãy quy về số đồng đầy đủ. Không chắc thì để 0 (chủ sẽ sửa lại). "
	"BỎ QUA các dòng không phải sản phẩm: tiêu đề, Tổng, Tổng thanh toán, Tiền khuyến mãi, Ứng trước, "
	"Thưởng, chữ ký, thông tin công ty. Chỉ trả JSON, không thêm chữ nào khác."
)


def _vision_extract(image_b64: str, mime: str) -> list[dict]:
	"""Call the configured LLM (Claude/Gemini/OpenAI) with the image; return parsed JSON rows."""
	from cago.chatbot import config

	cfg = config.load_primary()
	if not cfg.api_key or cfg.provider in ("deterministic", "fake", None):
		frappe.throw(_("Chưa cấu hình AI đọc ảnh. Vào cấu hình LLM (CAGO_LLM_*) rồi thử lại, hoặc dùng cách gõ dòng."))
	try:
		import httpx
	except ImportError:
		frappe.throw(_("Thiếu thư viện httpx trên máy chủ."))

	try:
		text = _vision_call(cfg, image_b64, mime, httpx)
	except httpx.HTTPStatusError as e:
		code = e.response.status_code
		frappe.throw(_("AI đọc ảnh lỗi (mã {0}). Kiểm tra cấu hình AI hoặc thử lại, hoặc gõ tay.").format(code))
	except httpx.HTTPError:
		frappe.throw(_("Không gọi được AI đọc ảnh (mạng/timeout). Thử lại hoặc gõ tay."))
	return _extract_json_array(text)


def _vision_call(cfg, image_b64, mime, httpx) -> str:
	p = (cfg.provider or "").lower()
	timeout = 60
	with httpx.Client(timeout=timeout) as client:
		if p == "anthropic":
			base = (cfg.base_url or "https://api.anthropic.com").rstrip("/")
			payload = {
				"model": cfg.model or "claude-3-5-sonnet-latest",
				"max_tokens": 2000,
				"messages": [{"role": "user", "content": [
					{"type": "image", "source": {"type": "base64", "media_type": mime, "data": image_b64}},
					{"type": "text", "text": _VISION_PROMPT},
				]}],
			}
			r = client.post(f"{base}/v1/messages", json=payload,
				headers={"content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": cfg.api_key})
			r.raise_for_status()
			return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
		if p == "gemini":
			base = (cfg.base_url or "https://generativelanguage.googleapis.com").rstrip("/")
			model = cfg.model or "gemini-1.5-flash"
			payload = {"contents": [{"parts": [{"text": _VISION_PROMPT}, {"inline_data": {"mime_type": mime, "data": image_b64}}]}]}
			r = client.post(f"{base}/v1beta/models/{model}:generateContent?key={cfg.api_key}", json=payload)
			r.raise_for_status()
			return "".join(part.get("text", "") for c in r.json().get("candidates", []) for part in c.get("content", {}).get("parts", []))
		# OpenAI-compatible (openai, deepseek with vision, etc.)
		base = (cfg.base_url or "https://api.openai.com/v1").rstrip("/")
		payload = {
			"model": cfg.model or "gpt-4o-mini",
			"max_tokens": 2000,
			"messages": [{"role": "user", "content": [
				{"type": "text", "text": _VISION_PROMPT},
				{"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
			]}],
		}
		r = client.post(f"{base}/chat/completions", json=payload,
			headers={"Authorization": f"Bearer {cfg.api_key}", "content-type": "application/json"})
		r.raise_for_status()
		return r.json()["choices"][0]["message"]["content"]


def _extract_json_array(text: str) -> list[dict]:
	if not text:
		return []
	m = re.search(r"\[.*\]", text, re.DOTALL)  # tolerate code fences / chatter around the array
	if not m:
		return []
	try:
		data = json.loads(m.group(0))
		return data if isinstance(data, list) else []
	except ValueError:
		return []


@frappe.whitelist()
def bulk_receive(items, invoice_image=None):
	"""Commit the reviewed rows: restock matched items + create new ones, with cost & price.
	`invoice_image` (a file_url, e.g. the photographed invoice) is saved as evidence on every
	stock receipt in this batch.

	items: [{name, qty, unit, cost, sell, item_code?, item_group?}]. Returns a per-row summary.
	"""
	ensure_owner()
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	results = []
	new_by_name: dict[str, str] = {}  # normalized new-product name → item_code created THIS batch (dedup)
	for it in items:
		name = (it.get("name") or "").strip()
		qty = flt(it.get("qty"))
		if not name or qty <= 0:
			results.append({"name": name, "ok": False, "error": "thiếu tên hoặc số lượng"})
			continue
		code = it.get("item_code")
		created = False
		try:
			if not code:
				# Same new name twice in one list → reuse the first-created item (no duplicate Items).
				key = name.lower()
				code = new_by_name.get(key)
				if not code:
					grp = it.get("item_group")
					if not grp or not frappe.db.exists("Item Group", grp):
						grp = frappe.db.get_value("Item Group", {"is_group": 0}, "name")
					new = create_product({
						"cago_display_name": name,
						"item_group": grp,
						"stock_uom": (it.get("unit") or "Cái"),
						"selling_price": flt(it.get("sell")),
					})
					code = new["item_code"]
					created = True
					new_by_name[key] = code
			try:
				receive_stock(code, qty, cost_rate=flt(it.get("cost")) or None, invoiced=1 if it.get("invoiced", True) else 0, invoice_image=invoice_image)
			except Exception:
				# Stock-in failed AFTER creating a brand-new item → delete the orphan so the
				# catalogue isn't littered with stockless phantom products.
				if created:
					frappe.delete_doc("Item", code, force=True, ignore_permissions=True)
					new_by_name.pop(name.lower(), None)
				raise
			results.append({"name": name, "item_code": code, "qty": qty, "created": created, "ok": True})
		except Exception as e:
			results.append({"name": name, "ok": False, "error": str(e)})
	record_action("Other", ref_doctype="Item", new_value=f"bulk receive {len([r for r in results if r.get('ok')])} dòng")
	frappe.db.commit()
	return {"results": results, "ok": sum(1 for r in results if r.get("ok")), "failed": sum(1 for r in results if not r.get("ok"))}


# Realistic demo catalogue for the shop (per owner: feed = only gà + lợn). Run once via:
#   bench --site <site> execute cago.api.bulk.seed_sample_products
# (name, item_group, unit, sell, stock, chemical)
_SAMPLE_PRODUCTS = [
	("Cám cò gà con C25 25kg", "Cám gà", "Bao", 320000, 20, 0),
	("Cám gà thịt Proconco 25kg", "Cám gà", "Bao", 300000, 15, 0),
	("Cám lợn siêu nạc CP 25kg", "Cám lợn", "Bao", 350000, 18, 0),
	("Cám tập ăn Greenfeed 25kg", "Cám lợn", "Bao", 380000, 10, 0),
	("Men tiêu hoá gia cầm", "Thuốc thú y", "Gói", 15000, 40, 0),
	("Vitamin C cho gà", "Thuốc thú y", "Gói", 12000, 50, 0),
	("Thuốc sát trùng chuồng trại", "Thuốc thú y", "Chai", 45000, 12, 1),
	("Thuốc trừ sâu Regent 800WG", "Thuốc trừ sâu bệnh", "Gói", 18000, 30, 1),
	("Thuốc trừ bệnh Anvil 5SC", "Thuốc trừ sâu bệnh", "Chai", 55000, 14, 1),
	("Thuốc trừ cỏ Glyphosate 480", "Thuốc cỏ", "Chai", 60000, 16, 1),
	("Thuốc diệt chuột Storm", "Thuốc chuột", "Gói", 12000, 25, 1),
	("NPK 16-16-8 Đầu Trâu", "Phân vô cơ", "Bao", 650000, 22, 0),
	("Đạm Phú Mỹ (Urea)", "Phân vô cơ", "Bao", 600000, 18, 0),
	("Phân hữu cơ Sông Gianh", "Phân hữu cơ", "Bao", 120000, 30, 0),
	("Lúa giống OM5451", "Giống lúa", "Bao", 320000, 12, 0),
	("Hạt giống rau cải xanh", "Giống rau", "Gói", 8000, 60, 0),
	("Bình phun thuốc 16L", "Dụng cụ", "Cái", 250000, 8, 0),
	("Cuốc bàn", "Dụng cụ", "Cái", 80000, 10, 0),
]


def seed_sample_products(force=False):
	"""Create the demo catalogue (idempotent: skips a product whose display name already exists)."""
	ensure_owner()
	made = 0
	for name, grp, unit, sell, stock, chem in _SAMPLE_PRODUCTS:
		if frappe.db.exists("Item", {"cago_display_name": name}):
			continue
		if not frappe.db.exists("Item Group", grp):
			parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"
			frappe.get_doc({"doctype": "Item Group", "item_group_name": grp, "parent_item_group": parent, "is_group": 0}).insert(ignore_permissions=True)
		new = create_product({"cago_display_name": name, "item_group": grp, "stock_uom": unit, "selling_price": sell, "cago_is_chemical": chem, "cago_is_public_visible": 1})
		if stock:
			receive_stock(new["item_code"], stock)
		made += 1
	frappe.db.commit()
	return {"created": made}
