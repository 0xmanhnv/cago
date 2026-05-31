# Milestone 0 + 1 — Test Plan & Verification

All checks assume the app is installed and `migrate` has run on `agrimate.local`.

## 1. Install reproducibility

On a **fresh** site, `install-app cago` + `migrate` must yield all fields,
DocTypes and roles with no manual Desk steps. Verify with:

```bash
bench --site agrimate.local execute frappe.client.get_count --kwargs "{'doctype': 'Custom Field', 'filters': {'fieldname': ['like', 'cago_%']}}"
```

Quick console check (`bench --site agrimate.local console`):

```python
import frappe
print("Item fields:",     frappe.db.count("Custom Field", {"dt": "Item",     "fieldname": ["like", "cago_%"]}))   # 18
print("Customer fields:", frappe.db.count("Custom Field", {"dt": "Customer", "fieldname": ["like", "cago_%"]}))   # 7
for dt in ["Cago Product Alternative", "Cago Wanted List", "Cago Wanted List Item", "Cago Owner Action Log"]:
    print(dt, "exists:", frappe.db.exists("DocType", dt))
for r in ["Cago Owner", "Cago Staff"]:
    print(r, "exists:", frappe.db.exists("Role", r))
```

## 2. Sample import

```bash
bench --site agrimate.local execute cago.setup.sample_data.import_sample_products
```

Expect "Created 4, updated 0". Then verify:

```python
import frappe
for code in ["CAM-GA-CON-25KG", "PHAN-LAN-VD-25KG", "NPK-16-16-8-A", "THUOC-CHUOT-A-GOI"]:
    it = frappe.get_doc("Item", code)
    price = frappe.db.get_value("Item Price",
        {"item_code": code, "price_list": "Standard Selling", "selling": 1}, "price_list_rate")
    print(code, it.cago_display_name, "| chemical:", it.cago_is_chemical, "| price:", price)
```

- `THUOC-CHUOT-A-GOI` must have `cago_is_chemical == 1` and non-empty
  `cago_safety_notes`.
- Prices: 320000 / 220000 / 420000 / 15000.

## 3. Idempotency

Run the import a second time. Expect "Created 0, updated 4" and **no** duplicate
Items or Item Prices.

## 4. Chemical safety helper

```python
from cago.utils.safety import safety_warning_for
import frappe
print(safety_warning_for(frappe.get_doc("Item", "THUOC-CHUOT-A-GOI")))  # standard warning + note
print(repr(safety_warning_for(frappe.get_doc("Item", "CAM-GA-CON-25KG"))))  # '' (not chemical, no note)
```

## 5. Wanted List code generation

```python
import frappe
wl = frappe.get_doc({"doctype": "Cago Wanted List",
    "items": [{"item_code": "CAM-GA-CON-25KG", "qty": 2}]}).insert()
print("code:", wl.code, "| name:", wl.name)   # WL-2026-#####, name == code
frappe.db.rollback()  # don't keep the test record
```

## 6. Permissions (server-side, not just UI)

```python
import frappe
# Owner can read the audit log; Staff cannot.
print("Owner sees log:", frappe.permissions.has_permission("Cago Owner Action Log",
    "read", user=<an owner user>))
print("Staff sees log:", frappe.permissions.has_permission("Cago Owner Action Log",
    "read", user=<a staff user>))   # expect False
```

Manual: log in as a user with only **Cago Staff** and confirm the Owner Action
Log is not listable. (Field-level hiding of import price/profit is enforced by the
DTO API layer in later milestones; M1 only establishes roles + DocType perms.)

## 7. Native POS fallback (M0/M2)

Confirm a POS Profile can be created and a native POS sale completes — independent
of POS Awesome (which is not installed). This must remain true throughout.

## 8. Rollback

```bash
# remove only this app; ERPNext/Frappe core untouched
bench --site agrimate.local uninstall-app cago
```

Custom fields/roles/DocTypes from `cago` are removed; ERPNext Items remain
(Items are core records). Restore a pre-change backup if a clean slate is needed.
