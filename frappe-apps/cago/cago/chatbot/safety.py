# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chemical-safety guardrails for the chatbot.

Detects chemical-sensitive intents and decides whether to refuse. The standard label
warning is injected by code (never relied upon from the LLM).
"""

from __future__ import annotations

import re
import unicodedata

from cago.utils.safety import STANDARD_SAFETY_WARNING


def _strip_accents(s: str) -> str:
	"""Lowercase + remove Vietnamese diacritics + đ→d, so accent-free typing matches too."""
	s = unicodedata.normalize("NFD", (s or "").lower())
	return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")

# Intent -> patterns. Matching any pattern flags that sensitive intent.
# The detector is deliberately broad (allow-by-default would be unsafe for a chemical store): any
# usage verb combined with a quantity/ratio/timing cue is treated as a dosage question and refused.
# Over-refusal merely escalates to the seller — acceptable; under-refusal would let the bot invent
# a dose, which the hard safety rules forbid.
# Application verbs (deliberately exclude the ambiguous "cho"/generic price words). Kept CLOSE to a
# quantity cue so "pha bao nhiêu"/"phun mấy lần"/"dùng bao nhiêu" are caught, while the very common
# price question "…giá bao nhiêu" (no application verb adjacent) is NOT misfired as a dosage ask.
_USE_VERB = r"(pha|trộn|phun|xịt|bón|tưới|rưới|rắc|rải|bơm|tẩm|hoà|hòa|đổ|dùng|sử dụng|xài)"
_INTENT_PATTERNS = {
	"dosage": [
		r"\bliều\b", r"liều lượng", r"liều dùng", r"định lượng", r"đủ liều", r"tỉ lệ", r"tỷ lệ",
		# application verb closely followed by a "how much / how many" cue
		_USE_VERB + r"[^\n]{0,6}(bao nhiêu|mấy)",
		# bare quantity asks tied to a real dosing unit (unambiguous regardless of verb)
		r"bao nhiêu\s*(ml|cc|gram|gam|g|kg|lít|lit|nắp|muỗng|thìa|gói|viên|bình|chai|lần|sào|gốc|cây)",
		r"mấy\s*(nắp|muỗng|thìa|gói|viên|bình|chai|lần|chén|ca|gáo|kg|lít|gram|gam)",
	],
	"mixing": [r"\btrộn\b", r"\bpha\b", r"pha với", r"pha (chung|cùng)", r"trộn (chung|với|cùng)", r"phối trộn", r"phối hợp", r"kết hợp .*thuốc"],
	"stronger_than_label": [r"tăng liều", r"đậm (đặc )?hơn", r"mạnh hơn", r"quá liều", r"gấp (đôi|ba|mấy|\d)", r"(phun|xịt|pha|bón|tưới)\b.{0,12}(đậm|mạnh|dày|nhiều hơn)", r"nhiều hơn .*(liều|nhãn|hướng dẫn)"],
	"near_harvest": [r"gần (ngày )?thu hoạch", r"trước (khi )?thu hoạch", r"cách ly", r"bao lâu .*(ăn|hái|gặt|thu hoạch)", r"thu hoạch .*phun", r"phun .*(rồi )?(bao lâu|mấy ngày)"],
	"misuse": [r"(ăn|uống|nuốt) .*(thuốc|chuột)", r"thuốc chuột .*(người|ăn)", r"dùng .*cho người"],
	"medical": [r"chữa bệnh cho (người|chó|mèo|bò|lợn|gà)", r"liều cho (người|vật)"],
}
_COMPILED = {intent: [re.compile(p, re.IGNORECASE) for p in pats] for intent, pats in _INTENT_PATTERNS.items()}

# Accent-free (and minimal English) patterns matched against the ACCENT-STRIPPED message. Rural users
# very often type WITHOUT diacritics ("lieu luong bao nhieu", "pha bao nhieu nuoc", "phun may lan") —
# the accented patterns above silently miss those, letting a dosage/mixing question reach the LLM
# ungated. Bare "lieu"/"du lieu" are deliberately OMITTED (they collide with "tài liệu"/"dữ liệu");
# we rely on dose-specific multiword + verb-near-quantity + quantity-near-unit cues instead.
_USE_VERB_NA = r"(pha|tron|phun|xit|bon|tuoi|ruoi|rac|rai|bom|tam|hoa|do|dung|su dung|xai)"
_INTENT_PATTERNS_NA = {
	"dosage": [
		r"lieu luong", r"lieu dung", r"dinh luong", r"t[iy] le",
		_USE_VERB_NA + r"[^\n]{0,6}(bao nhieu|may)",
		r"bao nhieu\s*(ml|cc|gram|gam|g|kg|lit|nap|muong|thia|goi|vien|binh|chai|lan|sao|goc|cay)",
		r"may\s*(nap|muong|thia|goi|vien|binh|chai|lan|chen|ca|gao|kg|lit|gram|gam)",
		r"\b(dose|dosage|how much|how many)\b",
	],
	"mixing": [r"pha voi", r"pha (chung|cung)", r"tron (chung|voi|cung)", r"phoi tron", r"phoi hop", r"ket hop .*thuoc", r"\b(mix|ratio|dilut)"],
	"stronger_than_label": [r"tang lieu", r"dam (dac )?hon", r"manh hon", r"qua lieu", r"gap (doi|ba|may|\d)", r"(phun|xit|pha|bon|tuoi)\b.{0,12}(dam|manh|day|nhieu hon)", r"nhieu hon .*(lieu|nhan|huong dan)", r"stronger"],
	"near_harvest": [r"gan (ngay )?thu hoach", r"truoc (khi )?thu hoach", r"cach ly", r"bao lau .*(an|hai|gat|thu hoach)", r"thu hoach .*phun", r"phun .*(roi )?(bao lau|may ngay)"],
	"misuse": [r"(an|uong|nuot) .*(thuoc|chuot)", r"thuoc chuot .*(nguoi|an)", r"dung .*cho nguoi"],
	"medical": [r"chua benh cho (nguoi|cho|meo|bo|lon|ga)", r"lieu cho (nguoi|vat)"],
}
_COMPILED_NA = {intent: [re.compile(p, re.IGNORECASE) for p in pats] for intent, pats in _INTENT_PATTERNS_NA.items()}

DOSAGE_REFUSAL = (
	"Dạ cháu là Mạnh, cháu không thể tự đưa ra liều lượng, cách pha/trộn hay thời gian "
	"cách ly. Bác vui lòng đọc kỹ hướng dẫn trên nhãn sản phẩm, hoặc hỏi trực tiếp người "
	"bán/cô Tuyết (chủ cửa hàng) hay người có chuyên môn để được tư vấn đúng. Bác để lại số "
	"điện thoại ở dưới, chủ sẽ gọi lại tư vấn giúp bác ạ.\n"
	+ STANDARD_SAFETY_WARNING
)


def classify(message: str) -> list[str]:
	"""Return the list of chemical-sensitive intents detected in the message. Matches the accented
	patterns against the raw text AND accent-free/English patterns against the diacritic-stripped text,
	so a question typed without dấu ("lieu luong bao nhieu") is caught the same as the accented form."""
	text = message or ""
	norm = _strip_accents(text)
	hits = set()
	for intent, regexes in _COMPILED.items():
		if any(r.search(text) for r in regexes):
			hits.add(intent)
	for intent, regexes in _COMPILED_NA.items():
		if any(r.search(norm) for r in regexes):
			hits.add(intent)
	return list(hits)


def is_sensitive(intents) -> bool:
	return bool(intents)


# Intents we NEVER answer, even with label text on file — asking to exceed/misuse the label, or a
# medical dose. These always refuse + escalate.
_NEVER_ANSWER = {"stronger_than_label", "misuse", "medical"}
# Intents that a manufacturer's LABEL legitimately covers — if the owner recorded the official label
# instructions on the product, quoting them is correct (not "inventing a dose").
_LABEL_ANSWERABLE = {"dosage", "mixing", "near_harvest"}


def answerable_from_data(intents, products) -> bool:
	"""Answer a sensitive question ONLY by quoting the official label the owner recorded on the
	product. Allowed when: no never-answer intent is present, the question is a label-coverable one,
	and exactly the focused product (single) has `label_instructions` on file. Otherwise refuse +
	escalate. We never let the LLM compose a dose — see label_answer (deterministic quote)."""
	intents = set(intents or [])
	if intents & _NEVER_ANSWER:
		return False
	if not (intents & _LABEL_ANSWERABLE):
		return False
	prods = [p for p in (products or []) if (p.get("label_instructions") or "").strip()]
	return len(prods) == 1


def label_answer(products) -> str | None:
	"""Build a SAFE answer that quotes the product's recorded label instructions verbatim (no
	invention), attributed to the label, plus the standard warning. Returns None if none on file."""
	prods = [p for p in (products or []) if (p.get("label_instructions") or "").strip()]
	if len(prods) != 1:
		return None
	p = prods[0]
	name = p.get("display_name") or "sản phẩm"
	return (
		f"Theo hướng dẫn ghi trên nhãn của {name}:\n\n{p['label_instructions'].strip()}\n\n"
		"Đây là thông tin chép từ nhãn sản phẩm. Nếu chưa rõ, bác hỏi thêm người bán/cô Tuyết hoặc "
		"người có chuyên môn nhé.\n" + STANDARD_SAFETY_WARNING
	)


def products_have_chemical(products) -> bool:
	return any(p.get("is_chemical") for p in (products or []))
