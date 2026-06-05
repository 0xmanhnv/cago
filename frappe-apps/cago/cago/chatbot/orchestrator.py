# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chatbot pipeline: safety -> retrieval -> context -> (LLM or deterministic) -> response.

The LLM is optional. With no provider configured (or on provider failure) the answer is
composed deterministically from retrieved data, so prices/stock are always real and the
kiosk never breaks.
"""

from __future__ import annotations

import time

from cago.utils.safety import STANDARD_SAFETY_WARNING

from . import config, context, deterministic, observability, prompts, retrieval, safety, storefacts, tools
from .providers import LLMError, Message, get_provider
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
	# Owner-recommended items first + a ⭐ marker, so "loại nào tốt nhất?" surfaces them.
	ordered = sorted(products, key=lambda p: not p.get("recommended"))
	any_reco = False
	for p in ordered[:5]:
		star = ""
		if p.get("recommended"):
			star, any_reco = "⭐ ", True
		bits = [f"• {star}{p.get('display_name')}: {p.get('price_text')}"]
		if p.get("use_cases"):
			bits.append(f"(dùng cho: {p['use_cases']})")
		if p.get("stock_status"):
			bits.append(f"- {p['stock_status']}")
		lines.append(" ".join(bits))
	if any_reco:
		lines.append("(⭐ là loại cửa hàng khuyên dùng.)")
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


# --------------------------------------------------------------------------- tool-calling
# When the configured provider supports function-calling, the model READS the store itself via
# the tools in `tools.py` (search/list/locate/best-sellers) instead of answering from a single
# pre-fetched retrieval guess. This is what stops "we don't have X" when X clearly exists — the
# model can keep looking. Safety (chemical dosage) is refused BEFORE this loop, so no tool can be
# used to extract invented dosage/mixing advice.
_MAX_TOOL_ROUNDS = 4


def _agent_system_prompt(role, focus_item, focus_category):
	base = f"{prompts.system_prompt()}\n{prompts._ROLE_NOTE.get(role, prompts._ROLE_NOTE['customer'])}"
	tool_rules = (
		"\nBạn CÓ công cụ tra cứu dữ liệu cửa hàng (danh mục, tìm sản phẩm, chi tiết sản phẩm, vị trí, "
		"bán chạy). LUÔN gọi công cụ để lấy giá/tồn/vị trí/danh mục/bán chạy — KHÔNG đoán, KHÔNG bịa. "
		"TUYỆT ĐỐI không tự khẳng định cửa hàng 'không có' một loại hàng khi CHƯA gọi search_products "
		"hoặc list_categories để kiểm tra. Nếu khách hỏi mơ hồ nhiều đối tượng (vd 'cám cho gà vịt lợn') "
		"hãy tìm cho từng đối tượng. Trả lời ngắn gọn, thân thiện, dựa trên kết quả công cụ."
	)
	hint = ""
	if focus_item:
		hint = f"\nKhách đang xem sản phẩm có mã '{focus_item}'. Câu hỏi mơ hồ (giá/tồn/vị trí) là về sản phẩm này."
	elif focus_category:
		hint = f"\nKhách đang xem loại hàng '{focus_category}'."
	return base + tool_rules + hint


def _run_agent(cfg, provider, role, message, history, focus_item, focus_category):
	"""Run the tool loop with one provider. Returns (text, [dto,...]). Raises LLMError on failure."""
	schemas = tools.anthropic_schemas() if provider.name == "anthropic" else tools.openai_schemas()
	msgs = [Message("system", _agent_system_prompt(role, focus_item, focus_category))]
	for turn in (history or [])[-6:]:
		r = turn.get("role")
		if r in ("user", "assistant") and turn.get("content"):
			msgs.append(Message(r, str(turn["content"])[:1000]))
	msgs.append(Message("user", message))

	collected, seen = [], set()
	model = cfg.model or ("claude-3-5-haiku-latest" if provider.name == "anthropic" else "gpt-4o-mini")
	for _round in range(_MAX_TOOL_ROUNDS):
		res = provider.chat(
			msgs, model=model, temperature=cfg.temperature, max_tokens=cfg.max_tokens,
			tools=schemas, timeout=cfg.timeout,
		)
		if not res.tool_calls:
			return res.text.strip(), collected
		msgs.append(Message("assistant", res.text or "", tool_calls=res.tool_calls))
		for tc in res.tool_calls:
			content, dtos = tools.run_tool(role, tc.name, tc.arguments)
			for d in dtos:
				code = d.get("item_code")
				if code and code not in seen:
					seen.add(code)
					collected.append(d)
			msgs.append(Message("tool", content, tool_call_id=tc.id, name=tc.name))
	# Out of rounds — force a final answer with the data already gathered (no more tools).
	msgs.append(Message("system", "Đã đủ dữ liệu tra cứu ở trên. Hãy trả lời khách ngắn gọn ngay bây giờ."))
	res = provider.chat(msgs, model=model, temperature=cfg.temperature, max_tokens=cfg.max_tokens, timeout=cfg.timeout)
	return res.text.strip(), collected


def _agent_answer(role, message, history, focus_item, focus_category):
	"""Tool-calling answer. Returns (ChatResponse, provider, model) or None when no tool-capable
	provider is configured (caller then uses the retrieval + single-shot/deterministic fallback)."""
	for cfg in (config.load_primary(), config.load_fallback()):
		if not cfg:
			continue
		provider = get_provider(cfg.provider, api_key=cfg.api_key, base_url=cfg.base_url)
		if provider is None or not provider.supports_tools():
			return None  # deterministic / non-tool provider → use fallback path
		try:
			text, dtos = _run_agent(cfg, provider, role, message, history, focus_item, focus_category)
		except LLMError:
			continue  # try fallback provider, else give up on the agent path
		if not text:
			continue
		cards = context.product_cards(dtos)
		warnings = [STANDARD_SAFETY_WARNING] if safety.products_have_chemical(dtos) else []
		resp = ChatResponse(
			answer_text=text, product_cards=cards, safety_warnings=warnings,
			needs_staff_help=False, sources=[c["item_code"] for c in cards], confidence="high",
		)
		return resp, cfg.provider, getattr(cfg, "model", None)
	return None


def _storefact_answer(role, message, focus_item):
	"""Deterministic store-level facts straight from the DB (no LLM): what we sell / best-sellers /
	where a product sits. Returns (ChatResponse, provider_tag) or None. These run with PRIORITY so a
	spurious product match can never dead-end a 'bán những gì?' / 'bán chạy?' question at the LLM."""
	if storefacts.is_overview(message):
		text, cats = storefacts.overview_answer(role)
		if text:
			return ChatResponse(answer_text=text, categories=cats, needs_staff_help=False, confidence="high"), "overview"
	if storefacts.is_bestseller(message):
		text, cards = storefacts.bestseller_answer(role)
		if text:
			return ChatResponse(
				answer_text=text, product_cards=cards, sources=[c.get("item_code") for c in cards],
				needs_staff_help=False, confidence="high",
			), "bestseller"
	# Location: only when a product is on screen, so "ở đâu?" is unambiguously about THAT product.
	if focus_item:
		where = storefacts._terms("where", deterministic.WHERE)
		if deterministic._has(deterministic._norm(message), where):
			text = storefacts.location_answer(role, focus_item)
			if text:
				return ChatResponse(answer_text=text, needs_staff_help=False, confidence="high"), "location"
	return None


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

	# 1) SENSITIVE chemical intent — handled deterministically FIRST, never via tools/LLM. If the
	# owner recorded the official LABEL instructions on the focused product, quote them; otherwise
	# refuse and escalate to the seller. (Retrieval here is only to find the focused/named product.)
	if safety.is_sensitive(intents):
		products = retrieval.resolve(
			role, message, focus_item=focus_item, focus_category=focus_category, history=history
		)
		cards = context.product_cards(products)
		sources = [c["item_code"] for c in cards]
		warnings = [STANDARD_SAFETY_WARNING]
		if safety.answerable_from_data(intents, products):
			resp = ChatResponse(
				answer_text=safety.label_answer(products), product_cards=cards, safety_warnings=warnings,
				needs_staff_help=False, sources=sources, confidence="medium",
			)
			provider_used = "label"
		else:
			resp = ChatResponse(
				answer_text=_refusal_answer(), product_cards=cards, safety_warnings=warnings,
				needs_staff_help=True, sources=sources, confidence="low",
			)
			provider_used = "refused"
		return _finish(resp, message, role, provider_used, model_used, started, intents, session_id, customer_phone)

	# 1b) OWNER-CURATED FAQ — an exact owner answer for a known question wins over everything below
	# (it is the shop's own voice). Sits AFTER the sensitive gate so it can't be used for dosage.
	faq = storefacts.faq_answer(message)
	if faq:
		resp = ChatResponse(answer_text=faq, needs_staff_help=False, confidence="high")
		return _finish(resp, message, role, "faq", model_used, started, intents, session_id, customer_phone)

	# 2) STORE-LEVEL FACTS (deterministic, query the DB) — "bán những gì?", "bán chạy?", "ở đâu?".
	# Priority so a spurious product match can't route these to the LLM and dead-end at "không có".
	fact = _storefact_answer(role, message, focus_item)
	if fact:
		resp, provider_used = fact
		return _finish(resp, message, role, provider_used, model_used, started, intents, session_id, customer_phone)

	# 3) MAIN — tool-calling LLM reads the store itself (best general path). Falls through to the
	# retrieval + single-shot/deterministic path when no tool-capable provider is configured.
	agent = _agent_answer(role, message, history, focus_item, focus_category)
	if agent is not None:
		resp, provider_used, model_used = agent
		return _finish(resp, message, role, provider_used, model_used, started, intents, session_id, customer_phone)

	# 4) FALLBACK — pre-fetch products, then single-shot LLM or keyword/deterministic answer.
	products = retrieval.resolve(
		role, message, focus_item=focus_item, focus_category=focus_category, history=history
	)
	cards = context.product_cards(products)
	sources = [c["item_code"] for c in cards]
	warnings = [STANDARD_SAFETY_WARNING] if safety.products_have_chemical(products) else []
	if not products:
		det = deterministic.reply(role, message, [])
		if det:
			resp = ChatResponse(answer_text=det, needs_staff_help=False, confidence="medium")
			provider_used = "keyword"
		else:
			resp = ChatResponse(answer_text=_no_data_answer(), needs_staff_help=True, confidence="low")
	else:
		text, prov, model = _llm_answer(role, products, message, history)
		if text is None:
			text = deterministic.reply(role, message, products) or _deterministic_answer(products)
			provider_used = "keyword"
		else:
			provider_used, model_used = prov, model
		resp = ChatResponse(
			answer_text=text, product_cards=cards, safety_warnings=warnings,
			needs_staff_help=False, sources=sources, confidence="high",
		)
	return _finish(resp, message, role, provider_used, model_used, started, intents, session_id, customer_phone)


def _finish(resp, message, role, provider_used, model_used, started, intents, session_id, customer_phone):
	observability.log(
		question=message, role=role, sources=resp.sources, provider=provider_used, model=model_used,
		latency_ms=int((time.monotonic() - started) * 1000), safety_flags=intents,
		needs_staff_help=resp.needs_staff_help, session_id=session_id, customer_phone=customer_phone,
	)
	return resp.to_dict()
