# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""OpenAI-compatible chat adapter.

One adapter covers OpenAI and any OpenAI-compatible server (Ollama, vLLM, LM Studio)
by switching `base_url`. An httpx client may be injected for testing.
"""

from __future__ import annotations

try:
	import httpx
except ImportError:  # deterministic/fake mode works without httpx
	httpx = None

from .base import LLMError, LLMProvider, LLMResult, Message


class OpenAICompatProvider(LLMProvider):
	name = "openai_compat"

	def __init__(self, api_key=None, base_url="https://api.openai.com/v1", client: httpx.Client | None = None):
		self.api_key = api_key
		self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
		self._client = client

	def _http(self, timeout):
		return self._client or httpx.Client(timeout=timeout)

	def chat(self, messages, *, model, temperature=0.2, max_tokens=800, tools=None, timeout=30) -> LLMResult:
		if httpx is None:
			raise LLMError("httpx not installed", kind="config", provider=self.name)
		payload = {
			"model": model,
			"messages": [{"role": m.role, "content": m.content} for m in messages],
			"temperature": temperature,
			"max_tokens": max_tokens,
		}
		if tools:
			payload["tools"] = tools
		headers = {"Content-Type": "application/json"}
		if self.api_key:
			headers["Authorization"] = f"Bearer {self.api_key}"

		try:
			resp = self._http(timeout).post(
				f"{self.base_url}/chat/completions", json=payload, headers=headers, timeout=timeout
			)
			resp.raise_for_status()
			data = resp.json()
			choice = data["choices"][0]
			return LLMResult(
				text=choice["message"]["content"] or "",
				model=data.get("model", model),
				provider=self.name,
				usage=data.get("usage"),
				finish_reason=choice.get("finish_reason"),
			)
		except httpx.TimeoutException as e:
			raise LLMError(str(e), kind="timeout", provider=self.name) from e
		except httpx.HTTPStatusError as e:
			kind = "auth" if e.response.status_code in (401, 403) else "server"
			raise LLMError(str(e), kind=kind, provider=self.name) from e
		except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
			raise LLMError(str(e), kind="error", provider=self.name) from e
