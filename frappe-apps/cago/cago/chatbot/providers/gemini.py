# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Google Gemini (generateContent) adapter."""

from __future__ import annotations

try:
	import httpx
except ImportError:
	httpx = None

from .base import LLMError, LLMProvider, LLMResult, Message


class GeminiProvider(LLMProvider):
	name = "gemini"

	def __init__(self, api_key=None, base_url="https://generativelanguage.googleapis.com", client: httpx.Client | None = None):
		self.api_key = api_key
		self.base_url = (base_url or "https://generativelanguage.googleapis.com").rstrip("/")
		self._client = client

	def _http(self, timeout):
		return self._client or httpx.Client(timeout=timeout)

	def chat(self, messages, *, model, temperature=0.2, max_tokens=800, tools=None, timeout=30) -> LLMResult:
		if httpx is None:
			raise LLMError("httpx not installed", kind="config", provider=self.name)
		system = "\n\n".join(m.content for m in messages if m.role == "system")
		contents = [
			{"role": ("model" if m.role == "assistant" else "user"), "parts": [{"text": m.content}]}
			for m in messages
			if m.role in ("user", "assistant")
		]
		payload = {
			"contents": contents,
			"generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
		}
		if system:
			payload["systemInstruction"] = {"parts": [{"text": system}]}
		url = f"{self.base_url}/v1beta/models/{model}:generateContent"
		params = {"key": self.api_key} if self.api_key else {}

		try:
			resp = self._http(timeout).post(url, params=params, json=payload, timeout=timeout)
			resp.raise_for_status()
			data = resp.json()
			cand = (data.get("candidates") or [{}])[0]
			parts = cand.get("content", {}).get("parts", [])
			text = "".join(p.get("text", "") for p in parts)
			return LLMResult(
				text=text,
				model=model,
				provider=self.name,
				usage=data.get("usageMetadata"),
				finish_reason=cand.get("finishReason"),
			)
		except httpx.TimeoutException as e:
			raise LLMError(str(e), kind="timeout", provider=self.name) from e
		except httpx.HTTPStatusError as e:
			kind = "auth" if e.response.status_code in (401, 403) else "server"
			raise LLMError(str(e), kind=kind, provider=self.name) from e
		except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
			raise LLMError(str(e), kind="error", provider=self.name) from e
