# Copyright (c) 2026, Cago and contributors
"""Tests for the chatbot's safety guardrails and answer assembly.

Retrieval is monkeypatched so tests run offline (no ERPNext needed).
"""

from app import main, retrieval, safety

CAM = {"item_code": "CAM-GA-CON-25KG", "display_name": "Cám cò gà con 25kg",
       "price_text": "320.000đ / Bao", "use_cases": "Gà con", "stock_status": "Còn hàng",
       "is_chemical": False}
THUOC = {"item_code": "THUOC-CHUOT-A-GOI", "display_name": "Thuốc chuột A dạng gói",
         "price_text": "15.000đ / Gói", "use_cases": "Kiểm soát chuột", "stock_status": "Còn hàng",
         "is_chemical": True}


def test_dosage_question_is_refused(monkeypatch):
	monkeypatch.setattr(retrieval, "search_products", lambda q: [THUOC])
	answer, sources, refused = main.build_answer("thuốc chuột pha bao nhiêu nước?")
	assert refused is True
	assert "không thể tự đưa ra liều" in answer.lower() or "không thể tự" in answer
	assert safety.STANDARD_SAFETY_WARNING in answer


def test_chemical_answer_includes_warning(monkeypatch):
	monkeypatch.setattr(retrieval, "search_products", lambda q: [THUOC])
	answer, sources, refused = main.build_answer("còn thuốc chuột không")
	assert refused is False
	assert "Thuốc chuột A" in answer
	assert safety.STANDARD_SAFETY_WARNING in answer
	assert "THUOC-CHUOT-A-GOI" in sources


def test_non_chemical_answer_has_no_warning(monkeypatch):
	monkeypatch.setattr(retrieval, "search_products", lambda q: [CAM])
	answer, sources, refused = main.build_answer("cám gà con giá bao nhiêu")
	assert "320.000đ" in answer
	assert safety.STANDARD_SAFETY_WARNING not in answer


def test_no_data_says_not_found(monkeypatch):
	monkeypatch.setattr(retrieval, "search_products", lambda q: [])
	answer, sources, refused = main.build_answer("máy cày")
	assert "không tìm thấy" in answer.lower()
	assert sources == []


def test_price_is_not_invented(monkeypatch):
	# The answer must only contain the price text the data provided.
	monkeypatch.setattr(retrieval, "search_products", lambda q: [CAM])
	answer, _, _ = main.build_answer("cám")
	assert "320.000đ / Bao" in answer
