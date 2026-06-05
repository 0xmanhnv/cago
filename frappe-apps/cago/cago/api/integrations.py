# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Channel integrations config — ONE admin-only surface for every external channel.

The shop talks to the outside world over several channels (Zalo/SMS relay, Telegram ops bot, Zalo
Mini App, ZaloPay). Their tokens/secrets are technical config, NOT the owner's business settings —
so they live here behind `ensure_admin()`, surfaced by the "Kết nối & Kênh" screen, and never
returned to a non-admin. The owner's business field `cago_owner_phone` stays in cago.api.notify.

Secrets are never returned — only `has_*` booleans. A setter overwrites a Password field only when a
non-empty value is supplied (so saving the rest of the form keeps an existing secret). See docs/45 +
docs/44 (toggle table). Setters delegate to the per-channel modules where one already exists
(notify.set_telegram, notify.set_webhook) so there is a single enforcement path per field.
"""

from __future__ import annotations

import frappe
from frappe import _

from cago.api.debt import _company
from cago.utils.permissions import ensure_admin
from cago.utils.secrets import has_secret


def _has(field: str) -> bool:
	# Truthful: a secret counts as "set" only if it is actually retrievable (encrypted in __Auth),
	# not merely present as a stale plaintext column value from before the secrets fix.
	return has_secret("Company", _company(), field)


@frappe.whitelist()
def get_integrations():
	"""ADMIN: full channel config for the Kết nối & Kênh screen. Secrets are masked to has_* flags."""
	ensure_admin()
	c = _company()
	get = lambda f: frappe.db.get_value("Company", c, f) or ""  # noqa: E731
	return {
		"public_url": get("cago_public_url"),
		# Zalo/SMS relay (outbound messaging webhook)
		"notify_webhook": get("cago_notify_webhook"),
		"has_notify_token": _has("cago_notify_token"),
		# Telegram ops bot
		"telegram_chat_id": get("cago_telegram_chat_id"),
		"telegram_owner_ids": get("cago_telegram_owner_ids"),
		"has_telegram_bot": _has("cago_telegram_bot_token"),
		"has_telegram_webhook": _has("cago_telegram_webhook_secret"),
		# Zalo Mini App
		"zalo_app_id": get("cago_zalo_app_id"),
		"zalo_oa_id": get("cago_zalo_oa_id"),
		"has_zalo_secret": _has("cago_zalo_app_secret"),
		# ZaloPay (optional online payment)
		"zalopay_merchant_id": get("cago_zalopay_merchant_id"),
		"has_zalopay_key": _has("cago_zalopay_key"),
	}


@frappe.whitelist()
def set_public_url(public_url=None):
	"""ADMIN: the app's public HTTPS origin — reused by the Telegram webhook, Zalo, and share links."""
	ensure_admin()
	url = (public_url or "").strip().rstrip("/")
	if url and not url.startswith("https://"):
		frappe.throw(_("Địa chỉ phải là HTTPS (vd: https://cuahang.example.com)."))
	frappe.db.set_value("Company", _company(), "cago_public_url", url)
	frappe.db.commit()
	return get_integrations()


@frappe.whitelist()
def set_zalo(app_id=None, oa_id=None, app_secret=None, zalopay_merchant_id=None, zalopay_key=None):
	"""ADMIN: Zalo Mini App + optional ZaloPay config. Password fields (app_secret, zalopay_key) are
	overwritten only when a non-empty value is supplied."""
	ensure_admin()
	from cago.utils.secrets import set_secret

	c = _company()
	if app_id is not None:
		frappe.db.set_value("Company", c, "cago_zalo_app_id", (app_id or "").strip())
	if oa_id is not None:
		frappe.db.set_value("Company", c, "cago_zalo_oa_id", (oa_id or "").strip())
	if app_secret:
		set_secret("Company", c, "cago_zalo_app_secret", app_secret)
	if zalopay_merchant_id is not None:
		frappe.db.set_value("Company", c, "cago_zalopay_merchant_id", (zalopay_merchant_id or "").strip())
	if zalopay_key:
		set_secret("Company", c, "cago_zalopay_key", zalopay_key)
	frappe.db.commit()
	return get_integrations()


def public_url() -> str:
	"""Stored public HTTPS origin (no trailing slash), or '' — shared helper for channel modules."""
	return (frappe.db.get_value("Company", _company(), "cago_public_url") or "").strip().rstrip("/")
