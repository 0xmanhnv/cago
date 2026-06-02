# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Lightweight per-IP rate limiting for guest endpoints (anti-abuse / DoS).

Uses the Redis cache as a fixed-window counter. Fail-open on cache hiccups so a Redis
blip never blocks a legitimate sale.
"""

import frappe
from frappe import _


def rate_guard(bucket, limit, seconds):
	"""Throw if more than `limit` calls happen in `seconds` from the same IP+bucket."""
	ip = getattr(frappe.local, "request_ip", None) or "local"
	key = f"cago_rl:{bucket}:{ip}"
	try:
		cache = frappe.cache()
		count = cache.incr(key)
		if count == 1:
			cache.expire(key, seconds)
	except Exception:
		return  # cache unavailable → don't block legitimate use
	if count and count > limit:
		frappe.throw(_("Thao tác quá nhanh. Bác chờ một lát rồi thử lại nhé."), frappe.ValidationError)
