app_name = "cago"
app_title = "Cago"
app_publisher = "0xManhnv"
app_description = (
    "Business customization layer for a rural Vietnamese agricultural supplies store."
)
app_email = "nguyenmanh0397@gmail.com"
app_license = "MIT"

# ERPNext is the source of truth; this app depends on it being installed.
required_apps = ["frappe", "erpnext"]

# ---------------------------------------------------------------------------
# Home page
# ---------------------------------------------------------------------------
# The decoupled Next.js app (web/) is the public entry and owns "/", "/login", "/pos/*".
# The old Frappe-native www/ pages (owner/staff/kiosk/login) have been removed — everything
# is served by Next now — so we no longer redirect Frappe logins to those routes.
home_page = "login"

# ---------------------------------------------------------------------------
# Schema setup — keep custom fields in sync on every install / migrate so a fresh
# deploy always has the full Cago schema (no manual ensure_* runs needed).
# ---------------------------------------------------------------------------
after_migrate = ["cago.setup.custom_fields.setup_all_fields"]
after_install = ["cago.setup.custom_fields.setup_all_fields"]

# A fresh login clears any pending POS PIN lock for the new session (escape hatch: forgot the PIN →
# just log in again, never stuck on the PIN screen).
on_login = "cago.api.session.clear_lock_on_login"

# ---------------------------------------------------------------------------
# Scheduled jobs — the Docker scheduler has no OS backup cron, so take a daily
# site backup (DB + files) and keep the last 7 days. Offsite copy is manual.
# ---------------------------------------------------------------------------
scheduler_events = {
	"daily": [
		"cago.setup.backup.daily",
		"cago.api.alerts.daily_owner_digest",  # push "việc hôm nay" (low stock / near-expiry / debt)
	],
	"cron": {
		# Expire support requests nobody accepted in time → ping the owner (minimal escalation).
		"*/2 * * * *": ["cago.api.support.expire_stale_requests"],
	},
}

# ---------------------------------------------------------------------------
# Document events
# ---------------------------------------------------------------------------
# Loyalty points accrue on every submitted Sales Invoice (POS + credit sale),
# and reverse on cancel. See cago/loyalty.py.
doc_events = {
	"Sales Invoice": {
		"on_submit": "cago.loyalty.accrue",
		"on_cancel": "cago.loyalty.reverse",
	},
	# Stable URL slug per customer (so links don't carry the Vietnamese docname).
	"Customer": {
		"before_insert": "cago.customer.set_slug",
		"validate": "cago.customer.set_slug",
	},
	# Editing a chức danh re-compiles cap-roles for everyone holding it; can't delete one in use.
	"Cago Job Role": {
		"on_update": "cago.job_role.on_update",
		"on_trash": "cago.job_role.on_trash",
	},
}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
# These make the Milestone 1 setup reproducible on a fresh site:
#   - Roles  (created first so DocType / Custom Field permissions resolve)
#   - Custom Fields on Item and Customer (all prefixed `cago_`)
#
# Custom DocTypes (Cago Product Alternative / Wanted List / Owner Action Log)
# are part of the app module itself, so they are installed by `migrate`, not by
# fixtures.
fixtures = [
    {
        "dt": "Role",
        "filters": [["name", "in", ["Cago Owner", "Cago Staff"]]],
    },
    {
        "dt": "Custom Field",
        "filters": [["fieldname", "like", "cago_%"]],
    },
    {
        "dt": "Property Setter",
        "filters": [["name", "like", "%cago_%"]],
    },
]
