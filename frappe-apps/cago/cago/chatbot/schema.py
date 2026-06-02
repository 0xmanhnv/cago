# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Structured chatbot response returned to the UI."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class ChatResponse:
	answer_text: str
	product_cards: list = field(default_factory=list)
	safety_warnings: list = field(default_factory=list)
	needs_staff_help: bool = False
	sources: list = field(default_factory=list)  # item_codes used as context
	confidence: str = "medium"  # high | medium | low

	def to_dict(self):
		return asdict(self)
