# Copyright (c) 2026, AgriMate and contributors
"""AgriMate chatbot service (FastAPI).

Answers customer product questions strictly from the store's public data. Never
invents price/stock/dosage; always appends the safety warning for chemicals;
refuses dosage/mixing questions.
"""

from fastapi import FastAPI
from pydantic import BaseModel

from . import retrieval, safety

app = FastAPI(title="AgriMate Chatbot", version="0.1.0")


class ChatRequest(BaseModel):
	message: str
	# Reserved for future role-aware behaviour; public answers only for now.
	role: str = "customer"


class ChatResponse(BaseModel):
	answer: str
	sources: list = []
	refused: bool = False


def build_answer(message: str):
	"""Deterministic, safe answer assembly. Returns (answer, sources, refused)."""
	message = (message or "").strip()
	if not message:
		return ("Bác muốn hỏi sản phẩm nào ạ?", [], False)

	# 1) Never give dosage / mixing advice.
	if safety.is_dosage_or_mixing_question(message):
		return (safety.DOSAGE_REFUSAL, [], True)

	# 2) Retrieve from public store data only.
	products = retrieval.search_products(message)
	if not products:
		return (
			"Mình không tìm thấy sản phẩm phù hợp trong dữ liệu cửa hàng. "
			"Bác hỏi trực tiếp người bán/chủ cửa hàng giúp mình nhé.",
			[],
			False,
		)

	# 3) Compose from retrieved facts (price text comes from ERPNext, not invented).
	lines = ["Cửa hàng có các sản phẩm này ạ:"]
	for p in products[:5]:
		bits = [f"• {p.get('display_name')}: {p.get('price_text')}"]
		if p.get("use_cases"):
			bits.append(f"(dùng cho: {p['use_cases']})")
		if p.get("stock_status"):
			bits.append(f"- {p['stock_status']}")
		lines.append(" ".join(bits))

	if safety.has_chemical(products):
		lines.append("")
		lines.append(safety.STANDARD_SAFETY_WARNING)

	sources = [p.get("item_code") for p in products[:5]]
	return ("\n".join(lines), sources, False)


@app.get("/health")
def health():
	return {"status": "ok", "service": "agrimate-chatbot"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
	answer, sources, refused = build_answer(req.message)
	return ChatResponse(answer=answer, sources=sources, refused=refused)
