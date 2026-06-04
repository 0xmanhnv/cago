# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Owner-editable chatbot knowledge stored in the DB (no rebuild to update).

`Cago Chatbot Settings` (Single) holds three owner-curated lists that augment the code
defaults: FAQ (question pattern -> answer), suggestion chips per context, and keyword
synonyms per deterministic intent. The code defaults remain the floor so the bot still works
with an empty/zero-config DB and offline. Compiled + cached; the controller clears the cache
on save. See docs/27 and [[chatbot-pipeline]]."""

from __future__ import annotations

import re

import frappe

from .deterministic import _norm

# A trigger phrase shorter than this (after accent-stripping) is too broad as a substring match
# (e.g. "có" would match almost everything), so it's ignored.
_MIN_TRIGGER = 3

_CACHE_KEY = "cago_chatbot_settings_compiled"


def _compiled():
	cached = frappe.cache().get_value(_CACHE_KEY)
	if cached is not None:
		return cached
	out = {"faq": [], "keywords": {}, "chips": {}}
	try:
		doc = frappe.get_single("Cago Chatbot Settings")
	except Exception:
		doc = None
	if doc:
		for r in (doc.get("faq") or []):
			if not (r.is_active and r.question and r.answer):
				continue
			# One answer can have MANY trigger phrasings (intent model): the question field holds one
			# phrasing per line (or separated by , ; |). Each becomes its own (trigger → same answer).
			for raw in re.split(r"[\n,;|]+", r.question):
				q = _norm(raw).strip()
				if len(q) >= _MIN_TRIGGER:
					out["faq"].append({"q": q, "answer": r.answer})
		# Longest pattern first so a more specific FAQ wins over a broad one.
		out["faq"].sort(key=lambda x: -len(x["q"]))
		for r in (doc.get("synonyms") or []):
			if r.intent_group and r.term:
				out["keywords"].setdefault(r.intent_group, []).append(_norm(r.term))
		for r in (doc.get("chips") or []):
			if r.context and r.label:
				out["chips"].setdefault(r.context, []).append(r.label)
	frappe.cache().set_value(_CACHE_KEY, out, expires_in_sec=300)
	return out


def clear_cache():
	try:
		frappe.cache().delete_value(_CACHE_KEY)
	except Exception:
		pass


def keywords(group):
	"""Owner-added (normalised) synonym terms for a deterministic intent group."""
	return _compiled()["keywords"].get(group, [])


def chips():
	"""Owner-added suggestion chips, keyed by context (general|category|product)."""
	return _compiled()["chips"]


def faq_rows():
	"""Active FAQ rows [{q (normalised pattern), answer}], longest pattern first."""
	return _compiled()["faq"]
