app_name = "cago"
app_title = "AgriMate Store"
app_publisher = "AgriMate"
app_description = (
    "Business customization layer for a rural Vietnamese agricultural supplies store."
)
app_email = "nguyenmanh0397@gmail.com"
app_license = "MIT"

# ERPNext is the source of truth; this app depends on it being installed.
required_apps = ["frappe", "erpnext"]

# ---------------------------------------------------------------------------
# Home page redirect after login
# ---------------------------------------------------------------------------
# The website root "/" serves the public customer kiosk.
home_page = "kiosk"

# Owner/staff must land on the simplified AgriMate screens, not the ERPNext Desk
# (they lack module permissions, so the Desk would show "Not permitted").
# These take precedence over `home_page` for the post-login redirect.
role_home_page = {
	"Cago Owner": "owner",
	"Cago Staff": "staff",
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
