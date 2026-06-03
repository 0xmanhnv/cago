# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Owner-editable AI / trợ lý configuration (live, no redeploy).

Stores provider/model/base_url/key for the primary + fallback LLM and the vision (OCR) model on the
Company singleton. cago.chatbot.config reads these with precedence env > here > site_config, so the
owner can switch model/provider or set a fallback from the app and it takes effect immediately —
no code change, image rebuild or redeploy. API keys are write-only (never returned).
"""

from __future__ import annotations

import frappe
from frappe import _

from cago.api.debt import _company
from cago.utils.permissions import ensure_owner

_DATA_FIELDS = (
	"cago_llm_provider",
	"cago_llm_model",
	"cago_llm_base_url",
	"cago_llm_vision_model",
	"cago_llm_fallback_provider",
	"cago_llm_fallback_model",
	"cago_llm_fallback_base_url",
)
_KEY_FIELDS = ("cago_llm_api_key", "cago_llm_fallback_api_key")


@frappe.whitelist()
def get_ai_config():
	"""Owner reads the AI config. Keys are never returned — only whether one is set. `effective` shows
	what is ACTUALLY used right now (incl. site_config/env fallbacks), so the owner sees the live state."""
	ensure_owner()
	from cago.chatbot import config

	c = _company()
	g = lambda f: frappe.db.get_value("Company", c, f) or ""
	primary = config.load_primary()
	fb = config.load_fallback()
	vision = config._get("CAGO_LLM_VISION_MODEL", "cago_llm_vision_model", db_field="cago_llm_vision_model") or primary.model
	return {
		"provider": g("cago_llm_provider"),
		"model": g("cago_llm_model"),
		"base_url": g("cago_llm_base_url"),
		"has_key": bool(g("cago_llm_api_key")),
		"vision_model": g("cago_llm_vision_model"),
		"fallback_provider": g("cago_llm_fallback_provider"),
		"fallback_model": g("cago_llm_fallback_model"),
		"fallback_base_url": g("cago_llm_fallback_base_url"),
		"fallback_has_key": bool(g("cago_llm_fallback_api_key")),
		"effective": {
			"provider": primary.provider,
			"model": primary.model or "",
			"vision_model": vision or "",
			"fallback_provider": (fb.provider if fb else ""),
			"fallback_model": (fb.model if fb else "") or "",
		},
	}


@frappe.whitelist()
def set_ai_config(**kwargs):
	"""Owner writes the AI config. Only fields supplied are changed; API keys are written only when a
	non-empty value is given (so the UI can leave them blank to keep the current key)."""
	ensure_owner()
	c = _company()
	for f in _DATA_FIELDS:
		if f in kwargs and kwargs[f] is not None:
			frappe.db.set_value("Company", c, f, (kwargs[f] or "").strip())
	for f in _KEY_FIELDS:
		if kwargs.get(f):  # only overwrite a secret when a real value is provided
			frappe.db.set_value("Company", c, f, kwargs[f].strip())
	frappe.db.commit()
	return get_ai_config()


@frappe.whitelist()
def test_ai(which="primary"):
	"""Owner: send a tiny prompt to validate the key/model/base_url. Returns {ok, reply|error}."""
	ensure_owner()
	from cago.chatbot import config
	from cago.chatbot.providers import get_provider
	from cago.chatbot.providers.base import Message

	cfg = config.load_primary() if which == "primary" else config.load_fallback()
	if not cfg or not cfg.api_key or cfg.provider in ("deterministic", "fake", None):
		return {"ok": False, "error": "Chưa cấu hình (provider/model/key)."}
	provider = get_provider(cfg.provider, api_key=cfg.api_key, base_url=cfg.base_url)
	if provider is None:
		return {"ok": True, "reply": "deterministic"}
	try:
		res = provider.chat([Message("user", "Trả lời đúng một từ: ok")], model=cfg.model or "", temperature=0, max_tokens=8, timeout=20)
		return {"ok": True, "reply": (res.text or "").strip()[:80] or "(rỗng)"}
	except Exception as e:  # noqa: BLE001 — report the provider's message to the owner
		return {"ok": False, "error": str(e)[:200]}
