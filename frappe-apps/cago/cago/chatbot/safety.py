# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chemical-safety guardrails for the chatbot.

Detects chemical-sensitive intents and decides whether to refuse. The standard label
warning is injected by code (never relied upon from the LLM).
"""

from __future__ import annotations

import re

from cago.utils.safety import STANDARD_SAFETY_WARNING

# Intent -> patterns. Matching any pattern flags that sensitive intent.
_INTENT_PATTERNS = {
	"dosage": [r"\bliều\b", r"liều lượng", r"bao nhiêu\s*(ml|cc|gram|gam|g|kg|lít|lit|nắp|muỗng|cc)", r"mấy nắp", r"phun bao nhiêu", r"bón bao nhiêu"],
	"mixing": [r"\btrộn\b", r"\bpha\b", r"pha với", r"phối trộn", r"kết hợp .*thuốc"],
	"stronger_than_label": [r"tăng liều", r"đậm (đặc )?hơn", r"mạnh hơn", r"quá liều", r"gấp đôi"],
	"near_harvest": [r"gần (ngày )?thu hoạch", r"trước (khi )?thu hoạch", r"cách ly", r"bao lâu .*ăn được", r"thu hoạch .*phun"],
	"misuse": [r"(ăn|uống|nuốt) .*(thuốc|chuột)", r"thuốc chuột .*(người|ăn)", r"dùng .*cho người"],
	"medical": [r"chữa bệnh cho (người|chó|mèo|bò|lợn|gà)", r"liều cho (người|vật)"],
}
_COMPILED = {intent: [re.compile(p, re.IGNORECASE) for p in pats] for intent, pats in _INTENT_PATTERNS.items()}

DOSAGE_REFUSAL = (
	"Dạ cháu là Mạnh, cháu không thể tự đưa ra liều lượng, cách pha/trộn hay thời gian "
	"cách ly. Bác vui lòng đọc kỹ hướng dẫn trên nhãn sản phẩm, hoặc hỏi trực tiếp người "
	"bán/cô Tuyết (chủ cửa hàng) hay người có chuyên môn để được tư vấn đúng.\n"
	+ STANDARD_SAFETY_WARNING
)


def classify(message: str) -> list[str]:
	"""Return the list of chemical-sensitive intents detected in the message."""
	text = message or ""
	return [intent for intent, regexes in _COMPILED.items() if any(r.search(text) for r in regexes)]


def is_sensitive(intents) -> bool:
	return bool(intents)


def answerable_from_data(intents, products) -> bool:
	"""A sensitive question may only be answered if verified data covers it.

	Conservative: we never auto-answer dosage/mixing/stronger/near-harvest/medical from
	free text, even if a product has notes — those must come from the label. So sensitive
	intents are always refused by the chatbot and escalated.
	"""
	return False


def products_have_chemical(products) -> bool:
	return any(p.get("is_chemical") for p in (products or []))
