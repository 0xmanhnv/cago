# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chemical-safety helpers.

For any chemical product (pesticide, herbicide, rat poison, crop-protection
chemical) the app must ALWAYS show the standard safety warning and must never
invent dosage or mixing advice.
"""

# The canonical warning text. Do not paraphrase per-product; show this verbatim.
STANDARD_SAFETY_WARNING = (
	"Lưu ý: Đọc kỹ hướng dẫn trên nhãn sản phẩm trước khi sử dụng. "
	"Để xa trẻ em, vật nuôi, thức ăn và nguồn nước. "
	"Không tự ý tăng liều hoặc trộn với sản phẩm khác nếu chưa có hướng dẫn rõ ràng."
)


def safety_warning_for(item):
	"""Return the safety warning to display for an item, or empty string.

	`item` may be a dict-like or Document exposing `cago_is_chemical` and
	optionally `cago_safety_notes`. Chemical products always get the standard
	warning; any product-specific note is appended, never substituted.
	"""
	is_chemical = bool(_get(item, "cago_is_chemical"))
	note = (_get(item, "cago_safety_notes") or "").strip()

	if not is_chemical:
		return note

	if note:
		return f"{STANDARD_SAFETY_WARNING}\n{note}"
	return STANDARD_SAFETY_WARNING


def _get(item, key):
	if isinstance(item, dict):
		return item.get(key)
	return getattr(item, key, None)
