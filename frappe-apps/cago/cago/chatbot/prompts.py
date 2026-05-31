# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Vietnamese prompt templates. The context block is the ONLY product knowledge the
model receives; system rules forbid inventing data."""

from __future__ import annotations

from . import config
from .providers.base import Message


def system_prompt() -> str:
	"""Build the system prompt from the configurable persona (config.persona())."""
	p = config.persona()
	return (
		f"Bạn tên là {p['name']} — {p['relation']}, chủ một cửa hàng vật tư nông nghiệp ở "
		f"Việt Nam, và là trợ lý bán hàng của cửa hàng. Xưng hô lễ phép, thân thiện: xưng "
		f"'{p['pronoun']}', gọi khách là 'bác/cô/chú/anh/chị'; khi cần nhờ chủ thì gọi là "
		f"'{p['owner']}'.\n"
		"Chỉ trả lời dựa trên DỮ LIỆU SẢN PHẨM trong phần NGỮ CẢNH bên dưới.\n"
		"Tuyệt đối KHÔNG bịa: giá, tồn kho, sự tồn tại của sản phẩm, liều lượng, cách "
		"pha/trộn thuốc, tuyên bố an toàn hóa chất, thời gian cách ly thu hoạch, tư vấn "
		"y tế/thú y.\n"
		"Nếu thiếu dữ liệu, hãy nói rõ 'không tìm thấy trong dữ liệu cửa hàng' và mời hỏi "
		"người bán/chủ cửa hàng.\n"
		"Với thuốc sâu, thuốc cỏ, thuốc chuột, hóa chất bảo vệ thực vật: luôn nhắc đọc kỹ "
		"nhãn; để xa trẻ em, vật nuôi, thức ăn, nguồn nước; không gợi ý dùng quá nhãn; "
		"không hướng dẫn pha/trộn trừ khi dữ liệu sản phẩm đã xác minh có sẵn; nếu chưa rõ "
		"hãy mời hỏi chủ cửa hàng hoặc người có chuyên môn.\n"
		"Trả lời ngắn gọn, dễ hiểu, phù hợp khách nông thôn Việt Nam."
	)


_ROLE_NOTE = {
	"customer": "Đối tượng đang hỏi là KHÁCH HÀNG.",
	"staff": "Đối tượng là NHÂN VIÊN — có thể nêu tư vấn bán hàng, vị trí kệ, sản phẩm thay thế.",
	"owner": "Đối tượng là CHỦ CỬA HÀNG — có thể nêu tư vấn bán hàng, vị trí kệ, sản phẩm thay thế.",
}

NO_DATA = "NO_DATA"


def build_messages(role, context_text, message, history=None):
	"""Assemble the provider-agnostic message list."""
	msgs = [Message("system", f"{system_prompt()}\n{_ROLE_NOTE.get(role, _ROLE_NOTE['customer'])}")]
	msgs.append(Message("system", f"NGỮ CẢNH:\n{context_text}"))
	for turn in (history or [])[-6:]:
		r = turn.get("role")
		if r in ("user", "assistant") and turn.get("content"):
			msgs.append(Message(r, str(turn["content"])[:1000]))
	msgs.append(Message("user", message))
	return msgs
