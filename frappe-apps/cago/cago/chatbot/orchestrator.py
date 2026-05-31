# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Chatbot pipeline: safety -> retrieval -> context -> (LLM or deterministic) -> response.

The LLM is optional. With no provider configured (or on provider failure) the answer is
composed deterministically from retrieved data, so prices/stock are always real and the
kiosk never breaks.
"""

from __future__ import annotations

import time

from cago.utils.safety import STANDARD_SAFETY_WARNING

from . import config, context, observability, prompts, retrieval, safety
from .providers import LLMError, get_provider
from .schema import ChatResponse

def _no_data_answer():
	p = config.persona()
	return (
		f"Dạ {p['pronoun']} là {p['name']} đây ạ. {p['pronoun'].capitalize()} chưa tìm thấy "
		f"sản phẩm này trong dữ liệu cửa hàng. Bác hỏi trực tiếp người bán hoặc {p['owner']} "
		f"(chủ cửa hàng) giúp {p['pronoun']} nhé."
	)


def _refusal_answer():
	p = config.persona()
	return (
		f"Dạ {p['pronoun']} là {p['name']}, {p['pronoun']} không thể tự đưa ra liều lượng, "
		f"cách pha/trộn hay thời gian cách ly. Bác vui lòng đọc kỹ hướng dẫn trên nhãn sản "
		f"phẩm, hoặc hỏi trực tiếp người bán/{p['owner']} (chủ cửa hàng) hay người có chuyên "
		f"môn để được tư vấn đúng.\n" + STANDARD_SAFETY_WARNING
	)


def _deterministic_answer(products):
	lines = ["Dạ, theo dữ liệu cửa hàng mình đang có:"]
	for p in products[:5]:
		bits = [f"• {p.get('display_name')}: {p.get('price_text')}"]
		if p.get("use_cases"):
			bits.append(f"(dùng cho: {p['use_cases']})")
		if p.get("stock_status"):
			bits.append(f"- {p['stock_status']}")
		lines.append(" ".join(bits))
	return "\n".join(lines)


def _llm_answer(role, products, message, history):
	"""Try primary then fallback provider; return text or None to use deterministic."""
	ctx = context.build(role, products)
	messages = prompts.build_messages(role, ctx, message, history)
	for cfg in (config.load_primary(), config.load_fallback()):
		if not cfg:
			continue
		provider = get_provider(cfg.provider, api_key=cfg.api_key, base_url=cfg.base_url)
		if provider is None:  # deterministic configured
			return None, None, None
		try:
			res = provider.chat(
				messages, model=cfg.model or "gpt-4o-mini",
				temperature=cfg.temperature, max_tokens=cfg.max_tokens, timeout=cfg.timeout,
			)
			if res.text.strip():
				return res.text.strip(), res.provider, res.model
		except LLMError:
			continue  # fall through to fallback / deterministic
	return None, None, None


def ask(role, message, history=None, session_id=None, customer_phone=None, focus_item=None, focus_category=None):
	"""Main entry. `role` in {customer, staff, owner}. Returns ChatResponse.to_dict().

	`focus_item`/`focus_category` describe what the user is currently viewing, so a
	context-free question ("còn hàng không?") is answered about that product/category.
	"""
	started = time.monotonic()
	message = (message or "").strip()[:1000]
	provider_used, model_used = "deterministic", None

	if not config.chatbot_enabled():
		resp = ChatResponse(answer_text=_no_data_answer(), needs_staff_help=True, confidence="low")
		return resp.to_dict()

	if not message:
		return ChatResponse(answer_text="Bác muốn hỏi sản phẩm nào ạ?", confidence="low").to_dict()

	intents = safety.classify(message)
	products = retrieval.resolve(
		role, message, focus_item=focus_item, focus_category=focus_category, history=history
	)
	cards = context.product_cards(products)
	sources = [c["item_code"] for c in cards]
	warnings = []
	if safety.products_have_chemical(products) or intents:
		warnings.append(STANDARD_SAFETY_WARNING)

	# 1) Unsafe chemical intent -> refuse, escalate (never call LLM for this).
	if safety.is_sensitive(intents) and not safety.answerable_from_data(intents, products):
		resp = ChatResponse(
			answer_text=_refusal_answer(), product_cards=cards, safety_warnings=warnings,
			needs_staff_help=True, sources=sources, confidence="low",
		)
		provider_used = "refused"
	# 2) No matching data -> say so (never invent existence).
	elif not products:
		resp = ChatResponse(
			answer_text=_no_data_answer(), needs_staff_help=True, confidence="low",
		)
	# 3) Normal: LLM if configured, else deterministic. Both grounded in retrieved data.
	else:
		text, prov, model = _llm_answer(role, products, message, history)
		if text is None:
			text = _deterministic_answer(products)
		else:
			provider_used, model_used = prov, model
		resp = ChatResponse(
			answer_text=text, product_cards=cards, safety_warnings=warnings,
			needs_staff_help=False, sources=sources, confidence="high",
		)

	observability.log(
		question=message, role=role, sources=sources, provider=provider_used, model=model_used,
		latency_ms=int((time.monotonic() - started) * 1000), safety_flags=intents,
		needs_staff_help=resp.needs_staff_help, session_id=session_id, customer_phone=customer_phone,
	)
	return resp.to_dict()
