# Copyright (c) 2026, AgriMate and contributors
"""Service configuration (env-driven)."""

import os


class Settings:
	# Base URL of the ERPNext stack. The frontend (nginx) forces the site via
	# FRAPPE_SITE_NAME_HEADER, so no Host header is needed when pointing at it.
	ERPNEXT_URL = os.environ.get("ERPNEXT_URL", "http://frontend:8080")
	# Only the public kiosk API is used — never authenticated/owner/staff endpoints.
	KIOSK_LIST = "/api/method/cago.api.kiosk.list_products"
	REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "10"))
	# Optional LLM. If unset, the service answers deterministically (safer + offline).
	LLM_ENABLED = os.environ.get("LLM_ENABLED", "0") == "1"


settings = Settings()
