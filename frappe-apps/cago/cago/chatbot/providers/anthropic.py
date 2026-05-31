# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Anthropic (Claude) Messages API adapter."""

from __future__ import annotations

try:
	import httpx
except ImportError:
	httpx = None

from .base import LLMError, LLMProvider, LLMResult, Message

ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
	name = "anthropic"

	def __init__(self, api_key=None, base_url="https://api.anthropic.com", client: httpx.Client | None = None):
		self.api_key = api_key
		self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")
		self._client = client

	def _http(self, timeout):
		return self._client or httpx.Client(timeout=timeout)

	def chat(self, messages, *, model, temperature=0.2, max_tokens=800, tools=None, timeout=30) -> LLMResult:
		if httpx is None:
			raise LLMError("httpx not installed", kind="config", provider=self.name)
		# Anthropic takes a top-level `system` plus user/assistant turns.
		system = "\n\n".join(m.content for m in messages if m.role == "system")
		turns = [{"role": m.role, "content": m.content} for m in messages if m.role in ("user", "assistant")]
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
			text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
			return LLMResult(
				text=text,
				model=data.get("model", model),
				provider=self.name,
				usage=data.get("usage"),
				finish_reason=data.get("stop_reason"),
			)
		except httpx.TimeoutException as e:
			raise LLMError(str(e), kind="timeout", provider=self.name) from e
		except httpx.HTTPStatusError as e:
			kind = "auth" if e.response.status_code in (401, 403) else "server"
			raise LLMError(str(e), kind=kind, provider=self.name) from e
		except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
			raise LLMError(str(e), kind="error", provider=self.name) from e
