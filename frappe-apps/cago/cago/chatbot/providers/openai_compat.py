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

import json

from .base import LLMError, LLMProvider, LLMResult, Message, ToolCall


class OpenAICompatProvider(LLMProvider):
	name = "openai_compat"

	def __init__(self, api_key=None, base_url="https://api.openai.com/v1", client: httpx.Client | None = None):
		self.api_key = api_key
		self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
		self._client = client

	def _http(self, timeout):
		return self._client or httpx.Client(timeout=timeout)

	def supports_tools(self) -> bool:
		return True

	def _encode(self, m: Message) -> dict:
		"""Map our Message onto an OpenAI chat message, carrying tool_calls / tool results."""
		if m.role == "tool":
			return {"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content or ""}
		msg = {"role": m.role, "content": m.content or ""}
		if m.tool_calls:
			msg["tool_calls"] = [
				{"id": tc.id, "type": "function",
				 "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)}}
				for tc in m.tool_calls
			]
		return msg

	def chat(self, messages, *, model, temperature=0.2, max_tokens=800, tools=None, timeout=30) -> LLMResult:
		if httpx is None:
			raise LLMError("httpx not installed", kind="config", provider=self.name)
		payload = {
			"model": model,
			"messages": [self._encode(m) for m in messages],
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
			msg = choice["message"]
			calls = []
			for tc in msg.get("tool_calls") or []:
				fn = tc.get("function") or {}
				try:
					args = json.loads(fn.get("arguments") or "{}")
				except (ValueError, TypeError):
					args = {}
				calls.append(ToolCall(id=tc.get("id") or "", name=fn.get("name") or "", arguments=args if isinstance(args, dict) else {}))
			return LLMResult(
				text=msg.get("content") or "",
				model=data.get("model", model),
				provider=self.name,
				usage=data.get("usage"),
				finish_reason=choice.get("finish_reason"),
				tool_calls=calls,
			)
		except httpx.TimeoutException as e:
			raise LLMError(str(e), kind="timeout", provider=self.name) from e
		except httpx.HTTPStatusError as e:
			kind = "auth" if e.response.status_code in (401, 403) else "server"
			raise LLMError(str(e), kind=kind, provider=self.name) from e
		except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
			raise LLMError(str(e), kind="error", provider=self.name) from e
