# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Run a block as another user WITHOUT corrupting the caller's web session.

`frappe.set_user()` is built for background/init contexts: besides switching the user it
overwrites `local.session.sid` with the username and wipes `local.session.data`. Using it
for in-request privilege elevation and then restoring with `set_user(actor)` leaves
sid=<username> and data={}, so at request end the real session is persisted under the wrong
key and the browser is silently logged out (next call comes back as Guest).

Cago elevates to Administrator for ERPNext accounting/stock submits (owner/staff hold no
ERPNext roles, but helpers like PaymentEntry.get_account_details call frappe.has_permission
directly). This context manager does that safely by snapshotting and restoring sid + data.
"""

from contextlib import contextmanager

import frappe


@contextmanager
def as_user(username):
	sess = frappe.local.session
	prev_user, prev_sid, prev_data = sess.user, sess.sid, sess.data
	try:
		frappe.set_user(username)
		yield
	finally:
		frappe.set_user(prev_user)
		# set_user() clobbers these; put the real web session back so it persists correctly.
		frappe.local.session.sid = prev_sid
		frappe.local.session.data = prev_data
