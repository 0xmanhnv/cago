# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt

import json

from cago.chatbot import config


def get_context(context):
	# Public page: customers browse without logging in. Only public-safe DTOs are
	# ever returned by the kiosk API; no role check needed here.
	context.no_cache = 1
	# Configurable assistant persona/branding -> injected into the page JS so the
	# tooltip, chat header and greeting are not hardcoded (easy to change per deploy).
	context.persona_json = json.dumps(config.persona())
	return context
