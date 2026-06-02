# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Deterministic provider for tests / offline use — no network."""

from __future__ import annotations

from .base import LLMProvider, LLMResult, Message


class FakeProvider(LLMProvider):
	name = "fake"

	def __init__(self, canned: str | None = None, **_):
		self._canned = canned

	def chat(self, messages, *, model="fake-1", temperature=0.2, max_tokens=800, tools=None, timeout=30) -> LLMResult:
		if self._canned is not None:
			text = self._canned
		else:
			last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
			text = f"[FAKE] {last_user}".strip()
		return LLMResult(text=text, model=model, provider=self.name, finish_reason="stop")
