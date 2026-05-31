# 18 — Coding Standards

## 1. General

- Prefer simple code.
- Use clear names.
- Avoid clever abstractions.
- Keep functions small.
- Add comments for business rules.
- Validate inputs.
- Return safe DTOs.
- Log sensitive actions.

## 2. Frappe/Python

- Use whitelisted methods for APIs.
- Enforce role checks server-side.
- Do not return raw DocType to kiosk.
- Use `frappe.get_value`, `frappe.get_all`, `frappe.db.get_value` carefully.
- Avoid direct SQL unless necessary.
- Use transactions for price/debt updates if needed.
- Add audit log for sensitive changes.

## 3. API style

Bad:

```python
return frappe.get_doc("Item", item_code).as_dict()
```

Good:

```python
return {
    "item_code": item.item_code,
    "display_name": item.cago_display_name or item.item_name,
    "image": item.image,
    "price_text": format_price(price),
    "public_description": item.cago_public_description,
}
```

## 4. Permissions

Do not trust frontend hiding.

Server must enforce:

- kiosk public-safe fields only
- staff no import price/profit
- owner required for price edit
- owner/staff required for debt operations

## 5. JavaScript

- Keep vanilla JS simple.
- Avoid heavy state management in MVP.
- Use progressive enhancement.
- Handle loading/error states.
- Keep buttons large.

## 6. CSS

- Prefer simple classes.
- Avoid complex styling frameworks in MVP.
- Keep high contrast.
- Tablet-friendly spacing.

## 7. Testing

Each feature must include:

- manual test checklist
- role/security test
- fallback path
- rollback note

## 8. POS Awesome changes

Do not patch POS Awesome directly unless:

- issue is documented
- patch is minimal
- fallback is known
- upgrade impact is recorded
