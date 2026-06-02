# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Provider-agnostic LLM interface.

Business logic depends ONLY on this module, never on a concrete provider. Adapters
map the common Message list to/from a vendor API. No product knowledge or DB access
lives here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field


@dataclass
class Message:
	role: str  # "system" | "user" | "assistant"
	content: str


@dataclass
class LLMResult:
	text: str
	model: str
	provider: str
	usage: dict | None = None
	finish_reason: str | None = None


class LLMError(Exception):
	"""Normalized provider failure (timeout / auth / rate-limit / server / parse)."""

	def __init__(self, message, *, kind="error", provider=None):
		super().__init__(message)
		self.kind = kind
		self.provider = provider


class LLMProvider(ABC):
	name: str = "base"

	@abstractmethod
	def chat(
		self,
		messages: list[Message],
		*,
		model: str,
		temperature: float = 0.2,
		max_tokens: int = 800,
		tools: list | None = None,
		timeout: int = 30,
	) -> LLMResult: ...

	def stream_chat(self, messages: list[Message], **kwargs) -> Iterator[str]:
		raise NotImplementedError(f"{self.name} does not support streaming")

	def supports_streaming(self) -> bool:
		return False
