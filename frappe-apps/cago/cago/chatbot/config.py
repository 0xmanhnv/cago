# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chatbot configuration.

Precedence: environment variable > Frappe site_config > default. Secrets (API keys)
are read here and never logged. With nothing configured, the provider is
"deterministic" so the chatbot works offline out of the box.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _get(env_key, conf_key, default=None):
	val = os.environ.get(env_key)
	if val not in (None, ""):
		return val
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
		"product": ["Còn hàng không?", "Giá bao nhiêu?", "Dùng cho gì?", "Có loại nào khác?", "Có an toàn không?"],
		"category": ["Loại nào rẻ hơn?", "Loại nào tốt?", "Còn hàng không?"],
		"general": ["Giá bao nhiêu?", "Còn hàng không?", "Dùng cho lúa", "Trị sâu bệnh", "Phân bón cho cây", "Thuốc diệt chuột"],
	}


def chatbot_enabled() -> bool:
	return str(_get("CAGO_CHATBOT_ENABLED", "cago_chatbot_enabled", "1")).lower() not in ("0", "false", "no")


def load_primary() -> LLMConfig:
	return LLMConfig(
		provider=_get("CAGO_LLM_PROVIDER", "cago_llm_provider", "deterministic"),
		model=_get("CAGO_LLM_MODEL", "cago_llm_model"),
		base_url=_get("CAGO_LLM_BASE_URL", "cago_llm_base_url"),
		api_key=_get("CAGO_LLM_API_KEY", "cago_llm_api_key"),
		temperature=float(_get("CAGO_LLM_TEMPERATURE", "cago_llm_temperature", 0.2)),
		# Higher default so reasoning models (e.g. DeepSeek "flash") have budget for
		# chain-of-thought AND a complete final answer (avoids truncation = finish "length").
		max_tokens=int(_get("CAGO_LLM_MAX_TOKENS", "cago_llm_max_tokens", 2048)),
		timeout=int(_get("CAGO_LLM_TIMEOUT", "cago_llm_timeout", 45)),
	)


def load_fallback() -> LLMConfig | None:
	provider = _get("CAGO_LLM_FALLBACK_PROVIDER", "cago_llm_fallback_provider")
	if not provider:
		return None
	return LLMConfig(
		provider=provider,
		model=_get("CAGO_LLM_FALLBACK_MODEL", "cago_llm_fallback_model"),
		base_url=_get("CAGO_LLM_FALLBACK_BASE_URL", "cago_llm_fallback_base_url"),
		api_key=_get("CAGO_LLM_FALLBACK_API_KEY", "cago_llm_fallback_api_key"),
	)
