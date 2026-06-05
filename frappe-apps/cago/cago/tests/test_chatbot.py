# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Tests for the chatbot: providers, factory/switch, safety, context, retrieval roles,
and the orchestrator (no-data, chemical refusal, real-price cards).

Run: bench --site <site> run-tests --app cago --module cago.tests.test_chatbot
"""

import frappe
import httpx
from frappe.tests.utils import FrappeTestCase

from cago.chatbot import context, orchestrator, retrieval, safety
from cago.chatbot import observability
from cago.chatbot.providers import LLMError, get_provider
from cago.chatbot.providers.base import Message
from cago.chatbot.providers.fake import FakeProvider
from cago.chatbot.providers.openai_compat import OpenAICompatProvider

KIOSK_ITEM = "CAM-GA-CON-25KG"
CHEM_ITEM = "THUOC-CHUOT-A-GOI"


# --------------------------- providers / factory --------------------------- #
class TestChatbotProviders(FrappeTestCase):
	def test_fake_provider_echoes_user(self):
		res = FakeProvider().chat([Message("user", "xin chào")], model="fake")
		self.assertIn("xin chào", res.text)

	def test_openai_compat_builds_request_and_parses(self):
		seen = {}

		def handler(request):
			seen["url"] = str(request.url)
			seen["auth"] = request.headers.get("authorization")
			return httpx.Response(200, json={
				"model": "m", "choices": [{"message": {"content": "chào bác"}, "finish_reason": "stop"}],
				"usage": {"total_tokens": 5},
			})

		client = httpx.Client(transport=httpx.MockTransport(handler))
		p = OpenAICompatProvider(api_key="secret", base_url="http://test/v1", client=client)
		res = p.chat([Message("user", "hi")], model="m")
		self.assertEqual(res.text, "chào bác")
		self.assertTrue(seen["url"].endswith("/chat/completions"))
		self.assertEqual(seen["auth"], "Bearer secret")

	def test_openai_compat_http_error_becomes_llmerror(self):
		client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
		p = OpenAICompatProvider(base_url="http://test/v1", client=client)
		with self.assertRaises(LLMError):
			p.chat([Message("user", "hi")], model="m")

	def test_factory_switches_by_name(self):
		self.assertIsInstance(get_provider("fake"), FakeProvider)
		self.assertIsInstance(get_provider("openai", api_key="k"), OpenAICompatProvider)
		self.assertIsInstance(get_provider("ollama", base_url="http://x/v1"), OpenAICompatProvider)
		self.assertIsNone(get_provider("deterministic"))
		self.assertIsNone(get_provider(None))
		with self.assertRaises(LLMError):
			get_provider("does-not-exist")


# --------------------------- phone validation --------------------------- #
class TestChatbotPhone(FrappeTestCase):
	def test_valid_vn_mobile_normalized(self):
		from cago.chatbot.observability import clean_phone
		self.assertEqual(clean_phone("0987654321"), "0987654321")
		self.assertEqual(clean_phone("098 765 4321"), "0987654321")
		self.assertEqual(clean_phone("+84987654321"), "0987654321")
		self.assertEqual(clean_phone("84387654321"), "0387654321")

	def test_invalid_phone_dropped(self):
		from cago.chatbot.observability import clean_phone
		for bad in ["", "abc", "12345", "0123456789", "0987", "99999999999", "0287654321"]:
			self.assertEqual(clean_phone(bad), "", f"should reject {bad!r}")


# --------------------------- safety --------------------------- #
class TestChatbotSafety(FrappeTestCase):
	def test_detects_sensitive_intents(self):
		self.assertIn("dosage", safety.classify("thuốc chuột pha bao nhiêu ml"))
		self.assertIn("mixing", safety.classify("trộn thuốc này với thuốc kia được không"))
		self.assertIn("stronger_than_label", safety.classify("tăng liều cho mạnh hơn"))
		self.assertIn("near_harvest", safety.classify("gần thu hoạch có phun được không"))

	def test_detects_dosage_phrasings_without_explicit_units(self):
		# Common rural phrasings that earlier slipped the unit-bound regex and reached the LLM.
		for q in ("tỉ lệ bao nhiêu", "dùng bao nhiêu là đủ", "phun mấy lần", "mấy muỗng cho 1 bình", "bón mấy kg cho 1 sào"):
			self.assertIn("dosage", safety.classify(q), q)

	def test_non_sensitive_is_empty(self):
		# Price / stock questions must NOT be misfired as dosage (they'd be wrongly refused).
		for q in ("cám gà con giá bao nhiêu", "phân npk bán bao nhiêu tiền", "dùng cho gà thì giá bao nhiêu", "còn hàng không"):
			self.assertEqual(safety.classify(q), [], q)

	def test_sensitive_is_never_auto_answered(self):
		self.assertFalse(safety.answerable_from_data(["dosage"], [{"is_chemical": 1}]))


# --------------------------- context --------------------------- #
class TestChatbotContext(FrappeTestCase):
	def test_context_rejects_sensitive_keys(self):
		with self.assertRaises(ValueError):
			context.build("customer", [{"display_name": "X", "valuation_rate": 100}])

	def test_no_data_sentinel(self):
		self.assertEqual(context.build("customer", []), "NO_DATA")


# --------------------------- retrieval roles --------------------------- #
class TestChatbotRetrievalRoles(FrappeTestCase):
	def test_customer_products_hide_staff_fields(self):
		for p in retrieval.search("customer", "npk"):
			self.assertNotIn("shelf_location", p)
			self.assertNotIn("staff_advice", p)

	def test_staff_products_include_staff_fields(self):
		prods = retrieval.search("staff", "npk")
		self.assertTrue(prods)
		self.assertIn("shelf_location", prods[0])


# --------------------- context-aware resolution (focus) --------------------- #
class TestChatbotFocusResolution(FrappeTestCase):
	def test_context_free_question_resolves_to_focused_product(self):
		# "còn hàng không?" has no product keyword; with focus_item it must answer
		# about the product being viewed, not return "not found".
		prods = retrieval.resolve("customer", "còn hàng không", focus_item=KIOSK_ITEM)
		self.assertTrue(prods)
		self.assertEqual(prods[0]["item_code"], KIOSK_ITEM)

	def test_explicit_keyword_wins_over_focus(self):
		# Naming a different product overrides whatever is on screen.
		prods = retrieval.resolve("customer", "npk", focus_item=KIOSK_ITEM)
		self.assertTrue(prods)
		self.assertNotEqual(prods[0]["item_code"], KIOSK_ITEM)

	def test_focus_category_lists_category_products(self):
		category = frappe.db.get_value("Item", KIOSK_ITEM, "item_group")
		prods = retrieval.resolve("customer", "còn gì không", focus_category=category)
		self.assertTrue(prods)
		self.assertTrue(all(p.get("item_code") for p in prods))

	def test_no_focus_no_keyword_returns_empty(self):
		self.assertEqual(retrieval.resolve("customer", "còn hàng không"), [])


# --------------------------- orchestrator --------------------------- #
class TestChatbotOrchestrator(FrappeTestCase):
	def setUp(self):
		# Don't persist logs during tests (orchestrator commits otherwise).
		self._log = observability.log
		observability.log = lambda **kw: None
		# Force deterministic mode so tests never call an external LLM (hermetic + fast).
		from cago.chatbot import config as cbconfig
		self._cfg = cbconfig
		self._lp, self._fb = cbconfig.load_primary, cbconfig.load_fallback
		cbconfig.load_primary = lambda: cbconfig.LLMConfig(provider="deterministic")
		cbconfig.load_fallback = lambda: None

	def tearDown(self):
		observability.log = self._log
		self._cfg.load_primary, self._cfg.load_fallback = self._lp, self._fb

	def test_no_data_says_not_found(self):
		r = orchestrator.ask("customer", "xe máy honda wave")
		self.assertEqual(r["confidence"], "low")
		self.assertTrue(r["needs_staff_help"])
		self.assertIn("tìm thấy", r["answer_text"].lower())

	def test_store_overview_lists_categories_not_dead_end(self):
		"""'Cửa hàng bán những gì?' must answer with the category list, not the no-data fallback."""
		r = orchestrator.ask("customer", "Cửa hàng bán những gì?")
		self.assertFalse(r["needs_staff_help"])  # NOT a dead-end "ask the seller"
		self.assertIn("cửa hàng mình có", r["answer_text"].lower())
		self.assertNotIn("chưa tìm thấy", r["answer_text"].lower())
		# Categories come back as tappable links (the UI turns each into a product-list link).
		self.assertTrue(r["categories"])
		self.assertTrue(r["categories"][0]["category"])

	def test_chemical_question_is_refused_with_warning(self):
		r = orchestrator.ask("customer", "thuốc chuột pha bao nhiêu nước")
		self.assertTrue(r["needs_staff_help"])
		self.assertTrue(r["safety_warnings"])

	def test_normal_answer_has_real_price_card(self):
		r = orchestrator.ask("customer", "cám gà con giá bao nhiêu")
		self.assertTrue(r["product_cards"])
		card = r["product_cards"][0]
		self.assertTrue(card["price_text"])
		self.assertIn(KIOSK_ITEM, r["sources"])

	def test_keyword_fallback_stock_intent(self):
		"""No-LLM keyword path: a 'còn hàng?' question answers about stock from real data."""
		r = orchestrator.ask("staff", "cám gà con còn hàng không")
		self.assertTrue(r["product_cards"])
		self.assertNotIn("chưa tìm thấy", r["answer_text"].lower())  # not the dead-end fallback

	def test_keyword_fallback_thanks_no_staff(self):
		"""'cảm ơn' is handled socially (no product, no dead-end, no escalation)."""
		r = orchestrator.ask("customer", "cảm ơn")
		self.assertIn("cảm ơn", r["answer_text"].lower())
		self.assertFalse(r["needs_staff_help"])

	def test_keyword_fallback_accentless(self):
		"""Rural users type without accents — 'gia bao nhieu' still matches the price intent."""
		r = orchestrator.ask("staff", "cam ga con gia bao nhieu")
		self.assertTrue(r["product_cards"])
		self.assertNotIn("chưa tìm thấy", r["answer_text"].lower())


# --------------------------- store-facts (deterministic, DB-backed) --------------------------- #
class TestChatbotStoreFacts(FrappeTestCase):
	def test_overview_keyword_coverage(self):
		from cago.chatbot import storefacts

		for q in ["Cửa hàng bán những gì?", "shop có gì bán", "co nhung loai gi", "kinh doanh gì"]:
			self.assertTrue(storefacts.is_overview(q), q)
		self.assertFalse(storefacts.is_overview("cám gà giá bao nhiêu"))
		text, links = storefacts.overview_answer("customer")
		self.assertTrue(text and links)

	def test_bestseller_keyword_coverage(self):
		from cago.chatbot import storefacts

		for q in ["bán chạy", "loại nào hay mua", "nhiều người mua", "sản phẩm hot", "đắt khách"]:
			self.assertTrue(storefacts.is_bestseller(q), q)
		self.assertFalse(storefacts.is_bestseller("phân bón cho lúa"))

	def test_locate_handles_missing_map_gracefully(self):
		from cago.chatbot import storefacts

		# Never raises; returns None or a dict — and None for a non-existent item.
		self.assertIsNone(storefacts.locate("DOES-NOT-EXIST-XYZ"))

	def test_faq_many_phrasings_one_answer(self):
		"""One FAQ answer can be triggered by several phrasings (one per line)."""
		from cago.chatbot import settings as cbsettings
		from cago.chatbot import storefacts

		doc = frappe.get_single("Cago Chatbot Settings")
		doc.set("faq", [])
		doc.append("faq", {"question": "giao hàng tận nơi\ncó ship không\ngiao tới nhà", "answer": "Dạ có giao ạ.", "is_active": 1})
		doc.save(ignore_permissions=True)
		cbsettings.clear_cache()
		try:
			self.assertEqual(storefacts.faq_answer("cho hỏi có ship không"), "Dạ có giao ạ.")
			self.assertEqual(storefacts.faq_answer("giao hàng tận nơi được không bác"), "Dạ có giao ạ.")
			self.assertEqual(storefacts.faq_answer("mình muốn giao tới nhà"), "Dạ có giao ạ.")
			self.assertIsNone(storefacts.faq_answer("cám gà giá bao nhiêu"))
		finally:
			doc.set("faq", [])
			doc.save(ignore_permissions=True)
			cbsettings.clear_cache()


# --------------------------- tool-calling agent loop --------------------------- #
class _ToolLoopProvider:
	"""Stub tool-capable provider: first turn asks a tool, second returns the final text."""

	name = "openai_compat"

	def __init__(self, tool_name, tool_args):
		self.calls = 0
		self._tool_name = tool_name
		self._tool_args = tool_args

	def supports_tools(self):
		return True

	def chat(self, messages, *, model, temperature=0.2, max_tokens=800, tools=None, timeout=30):
		from cago.chatbot.providers.base import LLMResult, ToolCall

		self.calls += 1
		if self.calls == 1:
			return LLMResult(
				text="", model=model, provider=self.name,
				tool_calls=[ToolCall(id="c1", name=self._tool_name, arguments=self._tool_args)],
			)
		return LLMResult(text="Dạ cửa hàng mình có ạ.", model=model, provider=self.name)


class TestChatbotToolCalling(FrappeTestCase):
	def setUp(self):
		self._log = observability.log
		observability.log = lambda **kw: None
		from cago.chatbot import config as cbconfig

		self._cfg = cbconfig
		self._lp, self._fb, self._gp = cbconfig.load_primary, cbconfig.load_fallback, orchestrator.get_provider
		cbconfig.load_primary = lambda: cbconfig.LLMConfig(provider="openai", model="gpt-4o-mini")
		cbconfig.load_fallback = lambda: None

	def tearDown(self):
		observability.log = self._log
		self._cfg.load_primary, self._cfg.load_fallback = self._lp, self._fb
		orchestrator.get_provider = self._gp

	def test_agent_loop_runs_tool_then_answers_with_cards(self):
		"""The model asks search_products; the tool surfaces a real item; cards come back."""
		stub = _ToolLoopProvider("search_products", {"query": "cám gà con"})
		orchestrator.get_provider = lambda *a, **k: stub
		r = orchestrator.ask("customer", "có cám gà con không")
		self.assertEqual(stub.calls, 2)  # tool round + final answer
		self.assertIn("có", r["answer_text"].lower())
		self.assertTrue(r["product_cards"])
		self.assertIn(KIOSK_ITEM, r["sources"])

	def test_tool_executor_is_role_safe(self):
		"""A customer tool result never carries cost/margin fields."""
		from cago.chatbot import tools

		content, dtos = tools.run_tool("customer", "get_product", {"item_code": KIOSK_ITEM})
		self.assertTrue(dtos)
		for d in dtos:
			for k in d:
				self.assertNotIn("cost", k.lower())
				self.assertNotIn("valuation", k.lower())
				self.assertNotIn("margin", k.lower())
