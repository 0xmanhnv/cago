# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Owner-only admin for the chatbot's editable knowledge (Cago Chatbot Settings).

Lets the owner curate FAQ answers, suggestion chips, and keyword synonyms from the app —
live, no rebuild. `add_*` endpoints back the "approve from insights" buttons (turn a real
customer question into a chip or an FAQ in one tap). All writes require the reports/owner
capability. See docs/27 and the chatbot pipeline ([[chatbot-pipeline]])."""

import frappe
from frappe import _

from cago.utils.permissions import ensure_cap

_DOCTYPE = "Cago Chatbot Settings"
_GROUPS = ("overview", "bestseller", "where")
_CONTEXTS = ("general", "category", "product")


def _settings():
	return frappe.get_single(_DOCTYPE)


@frappe.whitelist()
def get_settings():
	"""Return the owner-curated chatbot knowledge for the Settings UI."""
	ensure_cap("reports")
	doc = _settings()
	return {
		"faq": [
			{"question": r.question, "answer": r.answer, "is_active": int(r.is_active or 0)}
			for r in (doc.faq or [])
		],
		"chips": [{"context": r.context, "label": r.label} for r in (doc.chips or [])],
		"synonyms": [{"intent_group": r.intent_group, "term": r.term} for r in (doc.synonyms or [])],
	}


@frappe.whitelist()
def save_settings(faq=None, chips=None, synonyms=None):
	"""Replace the three child tables wholesale (the Settings screen sends the full lists)."""
	ensure_cap("reports")
	faq = frappe.parse_json(faq) if isinstance(faq, str) else (faq or [])
	chips = frappe.parse_json(chips) if isinstance(chips, str) else (chips or [])
	synonyms = frappe.parse_json(synonyms) if isinstance(synonyms, str) else (synonyms or [])
	doc = _settings()
	doc.faq = []
	for r in faq:
		q, a = (r.get("question") or "").strip(), (r.get("answer") or "").strip()
		if q and a:
			doc.append("faq", {"question": q, "answer": a, "is_active": int(r.get("is_active", 1))})
	doc.chips = []
	for r in chips:
		ctx, label = (r.get("context") or "general"), (r.get("label") or "").strip()
		if label and ctx in _CONTEXTS:
			doc.append("chips", {"context": ctx, "label": label})
	doc.synonyms = []
	for r in synonyms:
		grp, term = (r.get("intent_group") or ""), (r.get("term") or "").strip()
		if term and grp in _GROUPS:
			doc.append("synonyms", {"intent_group": grp, "term": term})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return get_settings()


@frappe.whitelist()
def add_faq(question, answer):
	"""Approve-from-insights: turn a real question into an FAQ answer."""
	ensure_cap("reports")
	q, a = (question or "").strip(), (answer or "").strip()
	if not q or not a:
		frappe.throw(_("Cần cả câu hỏi và câu trả lời."))
	doc = _settings()
	doc.append("faq", {"question": q, "answer": a, "is_active": 1})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def add_chip(label, context="general"):
	"""Approve-from-insights: turn a real question into a tappable suggestion chip."""
	ensure_cap("reports")
	label = (label or "").strip()
	if not label:
		frappe.throw(_("Thiếu nội dung gợi ý."))
	if context not in _CONTEXTS:
		context = "general"
	doc = _settings()
	# Skip duplicates (same context + label) so repeated approvals don't pile up.
	if any((r.context == context and (r.label or "").strip().lower() == label.lower()) for r in (doc.chips or [])):
		return {"ok": True, "duplicate": True}
	doc.append("chips", {"context": context, "label": label})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}
