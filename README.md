# ERPNext Agri Store Starter Pack v4

Bộ tài liệu này dùng để bắt đầu xây dựng **AgriMate** — hệ thống bán hàng cho cửa hàng vật tư nông nghiệp ở nông thôn Việt Nam.

## Quyết định mới trong v4

- Product name: **AgriMate**
- Repository: `agrimate`
- Custom Frappe app: `cago`
- MVP UI: **Frappe-native pages + Jinja/HTML + Vanilla JS + simple CSS**
- Phase 2 standalone kiosk: **Next.js + React + TypeScript + Tailwind + Radix/shadcn** nếu thật sự cần
- POS: **POS Awesome V15 recommended evaluation**, nhưng **ERPNext native POS mandatory fallback**
- Auxiliary services: **Python only**, không dùng Go

## Các file kỹ thuật mới

| File | Mục đích |
|---|---|
| `docs/15_TECH_STACK_AND_ENGINEERING_GUIDE.md` | Techstack, best practices, skill cần dùng |
| `docs/16_UI_UX_DESIGN_SYSTEM.md` | UI/UX rules cho mẹ, nhân viên, kiosk |
| `docs/17_REPO_STRUCTURE.md` | Cấu trúc repo đề xuất |
| `docs/18_CODING_STANDARDS.md` | Coding standards |
| `docs/19_DEPLOYMENT_PLAN.md` | Deployment plan |

---

Bộ tài liệu này dùng để bắt đầu xây dựng hệ thống bán hàng cho cửa hàng vật tư nông nghiệp ở nông thôn Việt Nam.

## Quyết định kiến trúc v3

Hướng chính:

```text
ERPNext / Frappe
  + custom Frappe app: cago
  + ERPNext native POS fallback
  + POS Awesome V15 as recommended evaluation POS UI
  + Python-only auxiliary services
```

## Tư duy quan trọng

- `cago` là lõi custom nghiệp vụ của cửa hàng.
- ERPNext là hệ thống quản lý chuẩn: sản phẩm, giá, kho, khách, công nợ, bán hàng, nhập hàng, báo cáo.
- POS Awesome V15 có thể dùng làm giao diện POS chính nếu test pass.
- ERPNext native POS luôn phải giữ làm fallback.
- Không dùng Go trong kiến trúc này. Nếu cần service ngoài, dùng Python.
- Không bắt mẹ/chủ cửa hàng dùng ERPNext gốc hằng ngày. Làm UI đơn giản riêng.

## File chính

| File | Mục đích |
|---|---|
| `CLAUDE.md` | Chỉ dẫn chính cho Claude Code |
| `prompts/MASTER_PROMPT_FOR_CLAUDE_CODE.md` | Prompt bắt đầu dự án |
| `prompts/POS_AWESOME_EVALUATION_PROMPT.md` | Prompt đánh giá POS Awesome V15 |
| `docs/01_PRD.md` | Yêu cầu sản phẩm |
| `docs/02_ARCHITECTURE.md` | Kiến trúc tổng thể |
| `docs/03_ERPNEXT_CAPABILITY_MAP.md` | ERPNext làm được gì sẵn/cần custom gì |
| `docs/04_POS_STRATEGY.md` | Chiến lược POS: native fallback + POS Awesome V15 |
| `docs/05_PYTHON_SERVICE_STRATEGY.md` | Chiến lược service phụ trợ bằng Python |
| `docs/06_ERPNEXT_CUSTOMIZATION.md` | Kế hoạch custom Frappe |
| `docs/07_DATA_MODEL.md` | Data model/custom fields/DTO |
| `docs/08_OWNER_STAFF_UI_SPEC.md` | UI đơn giản cho mẹ/chủ cửa hàng và nhân viên |
| `docs/09_KIOSK_APP_SPEC.md` | UI tablet/kiosk cho khách |
| `docs/10_CHATBOT_RAG_SPEC.md` | Chatbot an toàn |
| `docs/11_IMPLEMENTATION_BACKLOG.md` | Backlog theo milestone |
| `docs/12_SECURITY_AND_SAFETY.md` | Bảo mật, phân quyền, an toàn thuốc |
| `docs/13_TEST_PLAN.md` | Test plan |
| `docs/14_OPERATIONS_AND_TRAINING.md` | Vận hành, đào tạo mẹ dùng, backup |
| `data/sample_products.csv` | Dữ liệu mẫu |
| `data/custom_fields_spec.csv` | Danh sách custom fields đề xuất |

## Nguyên tắc triển khai

1. Không sửa ERPNext core.
2. `cago` chứa business-specific logic.
3. POS Awesome V15 được test như một module POS UI; không đặt dữ liệu nghiệp vụ cốt lõi vào nó.
4. Native POS luôn còn dùng được.
5. Toàn bộ auxiliary services dùng Python.
6. Kiosk chỉ đọc public-safe API.
7. Staff không thấy giá nhập/lợi nhuận.
8. Chatbot không bịa giá, tồn kho, liều lượng thuốc, hướng dẫn pha/trộn.
9. UI cho mẹ/chủ cửa hàng phải đơn giản, tiếng Việt, nút to, ít thao tác.
