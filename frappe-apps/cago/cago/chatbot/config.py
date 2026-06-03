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


def kiosk_chips() -> dict:
	"""Suggested tap-to-ask chips for the kiosk assistant — configurable per deployment
	(env CAGO_KIOSK_CHIPS / site_config cago_kiosk_chips as JSON {product,category,general}).
	Defaults live here in ONE place, not scattered/hardcoded in the UI."""
	import json

	raw = _get("CAGO_KIOSK_CHIPS", "cago_kiosk_chips")
	if raw:
		try:
			val = json.loads(raw) if isinstance(raw, str) else raw
			if isinstance(val, dict):
				return val
		except Exception:
			pass
	return {
		# Product context (a specific item is on screen): questions ABOUT that item.
		"product": ["Còn hàng không?", "Giá bao nhiêu?", "Dùng cho gì?", "Có loại nào khác?", "Có an toàn không?"],
		# Category context (a group is on screen): questions that compare items in the group.
		"category": ["Loại nào rẻ hơn?", "Loại nào tốt nhất?", "Loại nào còn hàng?", "Dùng thế nào?"],
		# No context (the opening screen): must be SELF-CONTAINED topics — never product-relative
		# questions like "Giá bao nhiêu?"/"Còn hàng không?" (bao nhiêu/còn hàng của CÁI GÌ?).
		"general": ["Cửa hàng bán những gì?", "Thuốc trừ sâu cho lúa", "Phân bón cho cây", "Cám cho gà vịt lợn", "Thuốc diệt chuột", "Thuốc diệt cỏ"],
	}


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
