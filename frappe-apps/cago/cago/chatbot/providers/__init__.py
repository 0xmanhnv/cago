# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Provider registry + factory. Add a provider = add an adapter + register here."""

from __future__ import annotations

from .anthropic import AnthropicProvider
from .base import LLMError, LLMProvider, LLMResult, Message
from .fake import FakeProvider
from .gemini import GeminiProvider
from .openai_compat import OpenAICompatProvider

# All these names route to the OpenAI-compatible adapter (base_url differentiates).
_OPENAI_ALIASES = ("openai", "openai_compat", "ollama", "vllm", "lmstudio", "local")

REGISTRY = {
	**{alias: OpenAICompatProvider for alias in _OPENAI_ALIASES},
	"anthropic": AnthropicProvider,
	"gemini": GeminiProvider,
	"fake": FakeProvider,
}

# Sensible default base URLs per provider family when none is configured.
DEFAULT_BASE_URLS = {
	"openai": "https://api.openai.com/v1",
	"ollama": "http://localhost:11434/v1",
	"vllm": "http://localhost:8000/v1",
	"lmstudio": "http://localhost:1234/v1",
	"anthropic": "https://api.anthropic.com",
	"gemini": "https://generativelanguage.googleapis.com",
}


def get_provider(provider: str | None, *, api_key=None, base_url=None) -> LLMProvider | None:
	"""Instantiate a provider by name. Returns None for deterministic/disabled."""
	if not provider or provider in ("deterministic", "none", "off"):
		return None
	cls = REGISTRY.get(provider)
	if not cls:
		raise LLMError(f"Unknown LLM provider: {provider}", kind="config")
	if cls is FakeProvider:
		return cls()
	resolved_base = base_url or DEFAULT_BASE_URLS.get(provider)
	return cls(api_key=api_key, base_url=resolved_base)


__all__ = ["REGISTRY", "get_provider", "LLMProvider", "LLMResult", "LLMError", "Message"]
