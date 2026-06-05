# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Consistent storage for Password custom fields (channel tokens/secrets).

Frappe keeps a Password field ENCRYPTED in the `__Auth` table — but only when it is set through a
saved doc or `set_encrypted_password`. Setting it via `frappe.db.set_value` instead writes the value
PLAINTEXT into the column and is invisible to `get_decrypted_password` (which reads `__Auth`). That
mismatch silently broke real reads (e.g. the Zalo/SMS Bearer token was never sent; the Telegram bot
token couldn't be read for webhook registration) and stored secrets in the clear (leaking via backup).

These helpers keep both ends consistent and encrypted:
  - `set_secret` encrypts into `__Auth` and leaves a `*****` placeholder in the column (so existing
    `bool(db.get_value(field))` "is it set?" checks keep working).
  - `get_secret` returns the decrypted value (or "").
  - `has_secret` reports whether a real value is stored.
"""

import frappe
from frappe.utils.password import get_decrypted_password, set_encrypted_password

_PLACEHOLDER = "*****"  # what the column shows once a secret lives (encrypted) in __Auth


def set_secret(doctype, name, field, value):
	"""Store (or clear) a Password field the encrypted way."""
	value = (value or "").strip()
	if value:
		set_encrypted_password(doctype, name, value, field)
		frappe.db.set_value(doctype, name, field, _PLACEHOLDER)
	else:
		frappe.db.delete("__Auth", {"doctype": doctype, "name": name, "fieldname": field})
		frappe.db.set_value(doctype, name, field, "")


def get_secret(doctype, name, field):
	"""The decrypted secret, or "" if unset."""
	return (get_decrypted_password(doctype, name, field, raise_exception=False) or "").strip()


def has_secret(doctype, name, field):
	"""True if a real secret is stored (decryptable)."""
	return bool(get_secret(doctype, name, field))
