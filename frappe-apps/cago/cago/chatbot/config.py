# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chatbot configuration.

Precedence: environment variable > Company DB field (owner-editable in the app) > Frappe
site_config > default. The DB layer lets the owner switch provider/model/fallback live from the
UI — no code change, rebuild or redeploy. Secrets (API keys) are read here and never logged.
With nothing configured, the provider is "deterministic" so the chatbot works offline out of the box.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _company():
	import frappe

	return frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")


def _db(field, password=False):
	"""Read an owner-set value from the Company singleton (None if unset). Decrypts Password fields."""
	try:
		import frappe

		c = _company()
		if not c:
			return None
		if password:
			from frappe.utils.password import get_decrypted_password

			return get_decrypted_password("Company", c, field, raise_exception=False) or None
		return frappe.db.get_value("Company", c, field) or None
	except Exception:
		return None


def _get(env_key, conf_key, default=None, db_field=None, password=False):
	# 1) env var (ops / emergency override)
	val = os.environ.get(env_key)
	if val not in (None, ""):
		return val
	# 2) Company DB field set by the owner in the app (live, no redeploy)
	if db_field:
		val = _db(db_field, password)
		if val not in (None, ""):
			return val
	# 3) site_config.json (deployment default)
	try:
		import frappe

		val = frappe.conf.get(conf_key)
		if val not in (None, ""):
			return val
	except Exception:
		pass
	return default


@dataclass
class LLMConfig:
	provider: str
	model: str | None = None
	base_url: str | None = None
	api_key: str | None = None
	temperature: float = 0.2
	max_tokens: int = 800
	timeout: int = 30


def persona() -> dict:
	"""Assistant identity / branding — configurable per deployment (no hardcoding).

	Override via env (CAGO_ASSISTANT_*) or site_config (cago_assistant_*).
	"""
	return {
		"name": _get("CAGO_ASSISTANT_NAME", "cago_assistant_name", "Mạnh"),
		"pronoun": _get("CAGO_ASSISTANT_PRONOUN", "cago_assistant_pronoun", "cháu"),
		"owner": _get("CAGO_OWNER_NAME", "cago_owner_name", "cô Tuyết"),
		"relation": _get("CAGO_ASSISTANT_RELATION", "cago_assistant_relation", "con cô Tuyết"),
		"tagline": _get(
			"CAGO_ASSISTANT_TAGLINE",
			"cago_assistant_tagline",
			"hỏi bằng lời như nói chuyện — giá bao nhiêu, dùng cho gì, còn hàng không...",
		),
	}


def learned_general_chips(limit=4):
	"""The most-asked, self-contained, ANSWERABLE customer questions from recent chat history — so
	the opening suggestions reflect what THIS shop's customers actually ask (tap instead of type).
	Cached 1h. Deterministic frequency clustering; excludes refused/needs-staff turns and product-
	relative questions (those only make sense with an item on screen)."""
	import frappe

	cached = frappe.cache().get_value("cago_learned_chips")
	if cached is not None:
		return cached
	out = []
	try:
		from frappe.utils import add_days, nowdate

		from cago.chatbot.deterministic import _norm

		rows = frappe.get_all(
			"Cago Chatbot Log",
			filters={"creation": [">=", add_days(nowdate(), -14) + " 00:00:00"], "role": ["!=", "staff"], "needs_staff_help": 0},
			fields=["question"],
			limit=3000,
		)
		groups = {}
		for r in rows:
			q = (r.question or "").strip()
			n = " ".join((_norm(q) or "").split())
			# Skip too-short and product-relative questions (need an item on screen to make sense).
			if len(q) < 6 or any(t in n for t in ("bao nhieu", "con hang", "gia ", "loai nao", "cai nay", "no ")):
				continue
			g = groups.setdefault(n, {"q": q, "c": 0})
			g["c"] += 1
		out = [g["q"] for g in sorted(groups.values(), key=lambda g: -g["c"]) if g["c"] >= 2][: int(limit)]
	except Exception:
		out = []
	frappe.cache().set_value("cago_learned_chips", out, expires_in_sec=3600)
	return out


def kiosk_chips() -> dict:
	"""Suggested tap-to-ask chips for the kiosk assistant — configurable per deployment
	(env CAGO_KIOSK_CHIPS / site_config cago_kiosk_chips as JSON {product,category,general}).
	Defaults live here in ONE place, not scattered/hardcoded in the UI. The `general` chips are
	augmented with auto-learned top questions (what this shop's customers actually ask)."""
	import json

	def _dedup(items, limit):
		seen, merged = set(), []
		for c in items:
			k = (c or "").strip().lower()
			if c and k not in seen:
				seen.add(k)
				merged.append(c)
		return merged[:limit]

	def _augment(d):
		# Owner-curated chips (DocType) take precedence, then learned top questions, then defaults.
		try:
			from cago.chatbot import settings as cbsettings

			db = cbsettings.chips()
		except Exception:
			db = {}
		d = dict(d)
		# general: owner chips + auto-learned questions + defaults (what THIS shop's customers ask).
		d["general"] = _dedup((db.get("general") or []) + learned_general_chips() + (d.get("general") or []), 8)
		for ctx in ("product", "category"):
			d[ctx] = _dedup((db.get(ctx) or []) + (d.get(ctx) or []), 8)
		return d

	raw = _get("CAGO_KIOSK_CHIPS", "cago_kiosk_chips")
	if raw:
		try:
			val = json.loads(raw) if isinstance(raw, str) else raw
			if isinstance(val, dict):
				return _augment(val)
		except Exception:
			pass
	return _augment({
		# Product context (a specific item is on screen): questions ABOUT that item.
		"product": ["Còn hàng không?", "Giá bao nhiêu?", "Dùng cho gì?", "Có loại nào khác?", "Có an toàn không?"],
		# Category context (a group is on screen): questions that compare items in the group.
		"category": ["Loại nào rẻ hơn?", "Loại nào tốt nhất?", "Loại nào còn hàng?", "Dùng thế nào?"],
		# No context (the opening screen): must be SELF-CONTAINED topics — never product-relative
		# questions like "Giá bao nhiêu?"/"Còn hàng không?" (bao nhiêu/còn hàng của CÁI GÌ?).
		"general": ["Cửa hàng bán những gì?", "Thuốc trừ sâu cho lúa", "Phân bón cho cây", "Cám cho gà vịt lợn", "Thuốc diệt chuột", "Thuốc diệt cỏ"],
	})


def extra_keywords(group) -> list:
	"""Owner-added keyword synonyms for a deterministic intent group, merged on top of the
	defaults baked into the code. Lets the owner teach the bot new local phrasings (e.g. a
	regional word for 'còn hàng') WITHOUT a code change/rebuild — same live-config principle as
	the LLM provider and kiosk chips. Source: env CAGO_CHATBOT_KEYWORDS / site_config
	cago_chatbot_keywords / Company.cago_chatbot_keywords, a JSON object {group: [terms...]}.
	Terms are normalised (accent-stripped) by the caller. Returns [] when unset/invalid."""
	import json

	terms = []
	raw = _get("CAGO_CHATBOT_KEYWORDS", "cago_chatbot_keywords", db_field="cago_chatbot_keywords")
	if raw:
		try:
			val = json.loads(raw) if isinstance(raw, str) else raw
			got = (val or {}).get(group) if isinstance(val, dict) else None
			if isinstance(got, list):
				terms.extend(str(t) for t in got)
		except Exception:
			pass
	# Owner-curated synonyms from the Cago Chatbot Settings DocType (live, no rebuild).
	try:
		from cago.chatbot import settings as cbsettings

		terms.extend(cbsettings.keywords(group))
	except Exception:
		pass
	return terms


def chatbot_enabled() -> bool:
	return str(_get("CAGO_CHATBOT_ENABLED", "cago_chatbot_enabled", "1")).lower() not in ("0", "false", "no")


def load_primary() -> LLMConfig:
	return LLMConfig(
		provider=_get("CAGO_LLM_PROVIDER", "cago_llm_provider", "deterministic", db_field="cago_llm_provider"),
		model=_get("CAGO_LLM_MODEL", "cago_llm_model", db_field="cago_llm_model"),
		base_url=_get("CAGO_LLM_BASE_URL", "cago_llm_base_url", db_field="cago_llm_base_url"),
		api_key=_get("CAGO_LLM_API_KEY", "cago_llm_api_key", db_field="cago_llm_api_key", password=True),
		temperature=float(_get("CAGO_LLM_TEMPERATURE", "cago_llm_temperature", 0.2)),
		# Higher default so reasoning models (e.g. DeepSeek "flash") have budget for
		# chain-of-thought AND a complete final answer (avoids truncation = finish "length").
		max_tokens=int(_get("CAGO_LLM_MAX_TOKENS", "cago_llm_max_tokens", 2048)),
		timeout=int(_get("CAGO_LLM_TIMEOUT", "cago_llm_timeout", 45)),
	)


def load_fallback() -> LLMConfig | None:
	provider = _get("CAGO_LLM_FALLBACK_PROVIDER", "cago_llm_fallback_provider", db_field="cago_llm_fallback_provider")
	if not provider:
		return None
	return LLMConfig(
		provider=provider,
		model=_get("CAGO_LLM_FALLBACK_MODEL", "cago_llm_fallback_model", db_field="cago_llm_fallback_model"),
		base_url=_get("CAGO_LLM_FALLBACK_BASE_URL", "cago_llm_fallback_base_url", db_field="cago_llm_fallback_base_url"),
		api_key=_get("CAGO_LLM_FALLBACK_API_KEY", "cago_llm_fallback_api_key", db_field="cago_llm_fallback_api_key", password=True),
	)
