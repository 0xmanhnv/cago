# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Go-live readiness — a one-screen go/no-go for a non-technical owner before opening to the public.

Onboarding (cago.api.alerts.onboarding_status) answers "is the basic setup done?". This answers the
harder question "is it SAFE and READY to run in the shop?" — data safety (backup, admin password),
security (HTTPS, kiosk PIN), and that the customer-facing surface actually works (kiosk products with
images, store map, contact channel). Each check has a severity so the owner sees blockers (❌) vs
nice-to-haves (⚠️) at a glance, with a link to fix. Owner-only; never raises."""

import frappe

from cago.utils.permissions import ensure_owner

OK, WARN, FAIL = "ok", "warn", "fail"


def _company():
	return frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")


def _admin_password_is_default():
	"""True if the Administrator password is still the install default 'admin' (a real risk on a
	public-facing box). Returns None if it can't be checked."""
	try:
		from frappe.utils.password import check_password

		check_password("Administrator", "admin")
		return True  # default still works → not secured
	except frappe.AuthenticationError:
		return False
	except Exception:
		return None


def _https():
	try:
		return frappe.utils.get_url().lower().startswith("https")
	except Exception:
		return None


def _scheduler_on():
	try:
		return not frappe.utils.scheduler.is_scheduler_disabled()
	except Exception:
		return None


def _check(key, label, status, detail, fix_href=None):
	return {"key": key, "label": label, "status": status, "detail": detail, "fix_href": fix_href}


@frappe.whitelist()
def golive_check():
	"""Grouped readiness checks. Returns {groups:[{title, items:[...]}], blockers, warnings, ready}."""
	ensure_owner()
	company = _company()
	item = frappe.qb.DocType("Item")

	# --- Customer-facing surface (the kiosk must not look empty/broken) ---
	visible = frappe.db.count("Item", {"disabled": 0, "cago_is_public_visible": 1})
	no_image = frappe.db.count("Item", {"disabled": 0, "cago_is_public_visible": 1, "image": ["in", ["", None]]})
	priced = frappe.db.count("Item Price", {"selling": 1, "price_list_rate": [">", 0]})
	cats = frappe.db.count("Item Group", {"is_group": 0, "cago_icon": ["!=", ""]})
	try:
		map_published = bool(frappe.db.get_single_value("Cago Store Map", "is_published"))
	except Exception:
		map_published = False

	surface = [
		_check("products", "Sản phẩm hiện cho khách",
			OK if visible >= 5 else (WARN if visible else FAIL),
			f"{visible} sản phẩm đang hiện trên màn khách" if visible else "Chưa có sản phẩm nào hiện cho khách",
			"/pos/products"),
		_check("images", "Ảnh sản phẩm",
			OK if no_image == 0 else WARN,
			"Tất cả đã có ảnh" if no_image == 0 else f"{no_image} sản phẩm thiếu ảnh (màn khách sẽ trống)",
			"/pos/products"),
		_check("price", "Giá bán", OK if priced else FAIL,
			f"{priced} mức giá đã đặt" if priced else "Chưa đặt giá bán", "/pos/price"),
		_check("category", "Loại hàng có biểu tượng", OK if cats else WARN,
			f"{cats} loại hàng" if cats else "Chưa tạo loại hàng có biểu tượng", "/pos/categories"),
		_check("map", "Sơ đồ cửa hàng (chỉ đường)", OK if map_published else WARN,
			"Đã đăng" if map_published else "Chưa đăng — khách không xem được vị trí/chỉ đường", "/pos/map"),
	]

	# --- Data safety & security ---
	admin_default = _admin_password_is_default()
	https = _https()
	sched = _scheduler_on()
	try:
		has_pin = bool(frappe.db.count("User", {"cago_pos_pin": ["not in", ["", None]]}))
	except Exception:
		has_pin = False

	safety = [
		_check("admin_pw", "Mật khẩu quản trị",
			FAIL if admin_default is True else (OK if admin_default is False else WARN),
			"Vẫn dùng mật khẩu mặc định — đổi ngay!" if admin_default is True else
			("Đã đổi khỏi mặc định" if admin_default is False else "Không kiểm tra được — hãy chắc chắn đã đổi")),
		_check("https", "Kết nối an toàn (HTTPS)",
			OK if https is True else (WARN if https is False else WARN),
			"Đang chạy HTTPS" if https else "Chưa có HTTPS — cần cho chụp ảnh nợ, PWA, bảo mật phiên"),
		_check("backup", "Tự động sao lưu",
			OK if sched else WARN,
			"Bộ lập lịch bật (sao lưu hằng ngày chạy)" if sched else "Bộ lập lịch tắt — sao lưu hằng ngày sẽ không chạy"),
		_check("pin", "Mã PIN cho máy dùng chung",
			OK if has_pin else WARN,
			"Đã đặt PIN" if has_pin else "Chưa đặt — máy dùng chung nên đặt PIN khoá nhanh", "/pos"),
	]

	# --- Operations (people & channels) ---
	owner_phone = company and frappe.db.get_value("Company", company, "cago_owner_phone")
	try:
		from cago.api import notify

		notify_on = notify.is_configured()
	except Exception:
		notify_on = False
	has_staff = bool(frappe.db.exists("Has Role", {"role": "Cago Sell", "parenttype": "User"}))

	ops = [
		_check("owner_phone", "Số điện thoại chủ", OK if owner_phone else FAIL,
			f"Đã có: {owner_phone}" if owner_phone else "Chưa có — cảnh báo & 'gọi nhân viên' không tới được chủ", "/pos/settings"),
		_check("notify", "Kênh nhắn tin (Zalo/SMS)", OK if notify_on else WARN,
			"Đã cấu hình" if notify_on else "Chưa cấu hình — nhắc việc/gọi hỗ trợ chỉ lưu nháp", "/pos/settings"),
		_check("staff", "Nhân viên bán hàng", OK if has_staff else WARN,
			"Đã có nhân viên" if has_staff else "Chưa thêm nhân viên (chủ vẫn bán được)", "/pos/staff"),
	]

	groups = [
		{"title": "🛍️ Màn hình khách", "items": surface},
		{"title": "🔒 An toàn dữ liệu & bảo mật", "items": safety},
		{"title": "👥 Vận hành & liên hệ", "items": ops},
	]
	all_items = [i for g in groups for i in g["items"]]
	blockers = sum(1 for i in all_items if i["status"] == FAIL)
	warnings = sum(1 for i in all_items if i["status"] == WARN)
	return {"groups": groups, "blockers": blockers, "warnings": warnings, "ready": blockers == 0}
