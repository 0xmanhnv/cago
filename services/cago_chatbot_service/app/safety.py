# Copyright (c) 2026, Cago and contributors
"""Safety guardrails for the chatbot (see docs/10_CHATBOT_RAG_SPEC.md, docs/12)."""

import re

STANDARD_SAFETY_WARNING = (
	"Lưu ý: Đọc kỹ hướng dẫn trên nhãn sản phẩm trước khi sử dụng. "
	"Để xa trẻ em, vật nuôi, thức ăn và nguồn nước. "
	"Không tự ý tăng liều hoặc trộn với sản phẩm khác nếu chưa có hướng dẫn rõ ràng."
)

SYSTEM_PROMPT = (
	"Bạn là trợ lý bán hàng của cửa hàng vật tư nông nghiệp ở Việt Nam.\n"
	"Bạn chỉ được trả lời dựa trên dữ liệu sản phẩm được cung cấp.\n"
	"Không được bịa giá, tồn kho, công dụng, liều lượng, hoặc hướng dẫn pha/trộn thuốc.\n"
	"Nếu thiếu dữ liệu, hãy nói không tìm thấy trong dữ liệu cửa hàng và đề nghị hỏi "
	"người bán/chủ cửa hàng.\n"
	"Với thuốc sâu, thuốc cỏ, thuốc chuột, hóa chất: luôn nhắc đọc kỹ nhãn, để xa trẻ "
	"em/vật nuôi/thức ăn/nguồn nước; không hướng dẫn pha liều/trộn thuốc; không chẩn "
	"đoán chắc chắn bệnh cây từ mô tả mơ hồ.\n"
	"Trả lời ngắn, dễ hiểu, phù hợp khách nông thôn Việt Nam."
)

# Questions we must never answer with invented advice.
_DOSAGE_PATTERNS = [
	r"\bliều\b", r"liều lượng", r"\bpha\b", r"pha bao nhiêu", r"trộn", r"phối trộn",
	r"bao nhiêu (ml|cc|gram|gam|g|kg|lít|lit|nắp|muỗng)", r"mấy nắp", r"tỉ lệ", r"tỷ lệ",
	r"phun bao nhiêu", r"bón bao nhiêu",
]
_DOSAGE_RE = re.compile("|".join(_DOSAGE_PATTERNS), re.IGNORECASE)

DOSAGE_REFUSAL = (
	"Mình không thể tự đưa ra liều lượng hoặc cách pha/trộn. "
	"Bác vui lòng đọc kỹ hướng dẫn trên nhãn sản phẩm hoặc hỏi trực tiếp người bán/chủ "
	"cửa hàng để được tư vấn đúng.\n" + STANDARD_SAFETY_WARNING
)


def is_dosage_or_mixing_question(text: str) -> bool:
	"""True if the user asks how much to use or how to mix — we must refuse."""
	return bool(_DOSAGE_RE.search(text or ""))


def has_chemical(products) -> bool:
	return any(p.get("is_chemical") for p in (products or []))
