# 06 — ERPNext / Frappe Customization Plan

> ℹ️ **Thực tế hiện tại:** còn nhiều custom field mới chưa liệt kê ở đây (lô/FEFO, ca/cashier, loyalty, đa đơn vị, `cago_recommended`…). Nguồn đúng: code `cago/setup/custom_fields.py` + fixture `custom_field.json`.

## 1. Custom app

Create Frappe app:

```text
cago
```

## 2. No core modifications

Avoid editing:

- ERPNext core
- Frappe core
- POS Awesome source unless a patch is explicitly justified

Prefer:

- Custom Fields
- Custom DocTypes
- fixtures
- whitelisted methods
- pages/workspaces
- client scripts
- hooks

## 3. Custom Item fields

| Fieldname | Label VN | Type |
|---|---|---|
| cago_display_name | Tên hiển thị | Data |
| cago_local_names | Tên dân dã / tên hay gọi | Small Text |
| cago_public_description | Mô tả ngắn cho khách | Small Text |
| cago_staff_advice | Câu tư vấn cho người bán | Text |
| cago_product_quality_tier | Mức chất lượng | Select |
| cago_use_cases | Dùng cho | Small Text |
| cago_crop_or_animal_targets | Cây/con phù hợp | Small Text |
| cago_package_color | Màu bao bì/chai/gói | Data |
| cago_shelf_location | Vị trí để hàng | Data |
| cago_stock_status_manual | Trạng thái tồn kho hiển thị | Select |
| cago_call_owner_when | Khi nào cần gọi chủ | Text |
| cago_safety_notes | Lưu ý an toàn | Text |
| cago_is_chemical | Là hóa chất/thuốc | Check |
| cago_is_public_visible | Hiển thị trên kiosk | Check |
| cago_kiosk_sort_order | Thứ tự kiosk | Int |

## 4. Customer fields

| Fieldname | Label VN | Type |
|---|---|---|
| cago_village | Xóm/thôn | Data |
| cago_customer_type | Loại khách | Select |
| cago_farming_notes | Ghi chú canh tác/chăn nuôi | Text |
| cago_zalo_phone | Số Zalo | Data |
| cago_debt_note | Ghi chú công nợ | Text |

## 5. Custom DocTypes

### Agri Product Alternative

- source_item
- alternative_item
- alternative_type: Cheaper/Equivalent/Better/Avoid
- note

### Agri Wanted List

- code
- status
- items
- expires_at
- note

### Agri Owner Action Log

- action_type
- ref_doctype
- ref_name
- old_value
- new_value
- user
- timestamp

## 6. Pages

```text
/agri-owner
/agri-staff
/agri-kiosk
```

## 7. API modules

```text
cago/api/
  kiosk.py
  staff.py
  owner.py
  pos.py
  chatbot.py
```

## 8. Fixtures

Export:

- Custom Field
- Role
- Custom DocType
- Role Permission
- Workspace/Page if needed
- Client Script if used
