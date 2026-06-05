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
class ToolCall:
	"""A model's request to invoke a tool. `arguments` is the parsed JSON args dict."""

	id: str
	name: str
	arguments: dict = field(default_factory=dict)


@dataclass
class Message:
	role: str  # "system" | "user" | "assistant" | "tool"
	content: str
	# assistant turn that requested tools (echoed back so the API keeps the call/result paired):
	tool_calls: list[ToolCall] | None = None
	# a "tool" role message answering one tool call:
	tool_call_id: str | None = None
	name: str | None = None


@dataclass
class LLMResult:
	text: str
	model: str
	provider: str
	usage: dict | None = None
	finish_reason: str | None = None
	# Populated when the model asks to call tools instead of (or before) answering.
	tool_calls: list[ToolCall] = field(default_factory=list)


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

	def supports_tools(self) -> bool:
		"""True when this provider can both emit tool_calls and accept tool-result messages —
		i.e. the orchestrator may run an agentic tool loop with it. Single-shot providers
		(fake/gemini-without-tools) return False so the orchestrator uses retrieval + context."""
		return False
