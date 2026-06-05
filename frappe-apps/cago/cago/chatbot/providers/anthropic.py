# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Anthropic (Claude) Messages API adapter."""

from __future__ import annotations

try:
	import httpx
except ImportError:
	httpx = None

from .base import LLMError, LLMProvider, LLMResult, Message, ToolCall

ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
	name = "anthropic"

	def __init__(self, api_key=None, base_url="https://api.anthropic.com", client: httpx.Client | None = None):
		self.api_key = api_key
		self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")
		self._client = client

	def _http(self, timeout):
		return self._client or httpx.Client(timeout=timeout)

	def supports_tools(self) -> bool:
		return True

	def _encode(self, m: Message) -> dict:
		"""Map our Message onto an Anthropic turn. Tool calls/results use content blocks."""
		if m.role == "tool":
			# A tool result is delivered as a user turn with a tool_result block.
			return {"role": "user", "content": [
				{"type": "tool_result", "tool_use_id": m.tool_call_id, "content": m.content or ""}
			]}
		if m.role == "assistant" and m.tool_calls:
			blocks = []
			if m.content:
				blocks.append({"type": "text", "text": m.content})
			for tc in m.tool_calls:
				blocks.append({"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.arguments or {}})
			return {"role": "assistant", "content": blocks}
		return {"role": m.role, "content": m.content or ""}

	def chat(self, messages, *, model, temperature=0.2, max_tokens=800, tools=None, timeout=30) -> LLMResult:
		if httpx is None:
			raise LLMError("httpx not installed", kind="config", provider=self.name)
		# Anthropic takes a top-level `system` plus user/assistant/tool turns.
		system = "\n\n".join(m.content for m in messages if m.role == "system")
		turns = [self._encode(m) for m in messages if m.role in ("user", "assistant", "tool")]
		payload = {"model": model, "max_tokens": max_tokens, "temperature": temperature, "messages": turns}
		if system:
			payload["system"] = system
		if tools:
			payload["tools"] = tools
		headers = {
			"content-type": "application/json",
			"anthropic-version": ANTHROPIC_VERSION,
		}
		if self.api_key:
			headers["x-api-key"] = self.api_key

		try:
			resp = self._http(timeout).post(
				f"{self.base_url}/v1/messages", json=payload, headers=headers, timeout=timeout
			)
			resp.raise_for_status()
			data = resp.json()
			blocks = data.get("content", [])
			text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
			calls = [
				ToolCall(id=b.get("id") or "", name=b.get("name") or "", arguments=b.get("input") or {})
				for b in blocks if b.get("type") == "tool_use"
			]
			return LLMResult(
				text=text,
				model=data.get("model", model),
				provider=self.name,
				usage=data.get("usage"),
				finish_reason=data.get("stop_reason"),
				tool_calls=calls,
			)
		except httpx.TimeoutException as e:
			raise LLMError(str(e), kind="timeout", provider=self.name) from e
		except httpx.HTTPStatusError as e:
			kind = "auth" if e.response.status_code in (401, 403) else "server"
			raise LLMError(str(e), kind=kind, provider=self.name) from e
		except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
			raise LLMError(str(e), kind="error", provider=self.name) from e
