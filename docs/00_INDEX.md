# 00 — Mục lục tài liệu Cago

Tài liệu chia làm **2 bộ**: **📘 Tài liệu sử dụng** (cho chủ/nhân viên, không cần kỹ thuật) và
**🛠 Tài liệu kỹ thuật** (cho người phát triển/vận hành). Cuối là **🗄 Lưu trữ** (quyết định/đánh
giá cũ đã bị thay thế — giữ để tra lịch sử, KHÔNG phản ánh hệ thống hiện tại).

Trạng thái: ✅ hiện hành · ⚠️ còn nội dung cũ (đọc kèm bản mới) · 🗄 lưu trữ.

---

## 📘 Tài liệu sử dụng (chủ & nhân viên)

| Tài liệu | Cho ai | Trạng thái |
|---|---|---|
| [user/HUONG_DAN_CHU.md](user/HUONG_DAN_CHU.md) — Hướng dẫn nhanh cho chủ (theo 6 nhóm chức năng mới) | Chủ | ✅ |
| [22_OWNER_TRAINING_VI.md](22_OWNER_TRAINING_VI.md) — Hướng dẫn chi tiết cho chủ (tra giá, sửa giá, ghi nợ, báo cáo) | Chủ | ✅ |
| [user/HUONG_DAN_NHAN_VIEN.md](user/HUONG_DAN_NHAN_VIEN.md) — Hướng dẫn bán hàng cho nhân viên | Nhân viên | ✅ |
| [user/CAU_HOI_THUONG_GAP.md](user/CAU_HOI_THUONG_GAP.md) — Câu hỏi thường gặp & xử lý nhanh | Chủ & NV | ✅ |
| [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md) — Mục C (QA thiết bị) & D (dọn dữ liệu) | Chủ/kỹ thuật | ✅ |

> Trong app cũng có sẵn nút **📖 Hướng dẫn** (Cài đặt cửa hàng) cho thao tác cơ bản.

---

## 🛠 Tài liệu kỹ thuật

### Tổng quan & kiến trúc
| Tài liệu | Trạng thái |
|---|---|
| [01_PRD.md](01_PRD.md) — Yêu cầu sản phẩm | ⚠️ còn tên "AgriMate" (nay = Cago) |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) — Kiến trúc | ⚠️ phần POS đã đổi (xem 36) |
| [27_FRONTEND_MIGRATION_NEXTJS.md](27_FRONTEND_MIGRATION_NEXTJS.md) — Chuyển frontend sang Next.js | ✅ nguồn đúng cho frontend |
| [03_ERPNEXT_CAPABILITY_MAP.md](03_ERPNEXT_CAPABILITY_MAP.md) — ERPNext cung cấp gì | ✅ |
| [17_REPO_STRUCTURE.md](17_REPO_STRUCTURE.md) — Cấu trúc repo | ⚠️ thiếu thư mục `web/` |
| [15_TECH_STACK_AND_ENGINEERING_GUIDE.md](15_TECH_STACK_AND_ENGINEERING_GUIDE.md) — Tech stack | ⚠️ "Phase 2 mới dùng Next.js" — thực tế đã migrate |

### Dữ liệu & tuỳ biến Frappe
| [06_ERPNEXT_CUSTOMIZATION.md](06_ERPNEXT_CUSTOMIZATION.md) — Custom fields/DocTypes | ⚠️ thiếu field mới (lô, ca, loyalty, đa đơn vị, khuyên dùng) |
| [07_DATA_MODEL.md](07_DATA_MODEL.md) — Mô hình dữ liệu / DTO | ⚠️ DTO cũ, thiếu trường mới |
| [05_PYTHON_SERVICE_STRATEGY.md](05_PYTHON_SERVICE_STRATEGY.md) — Dịch vụ Python (không dùng Go) | ✅ |

### API & phát triển
| [39_API_REFERENCE.md](39_API_REFERENCE.md) — Tham chiếu API `cago.api.*` (sinh từ code) | ✅ |
| [40_FRONTEND_DEV_GUIDE.md](40_FRONTEND_DEV_GUIDE.md) — Hướng dẫn dev frontend (`web/`) | ✅ |
| [41_DATA_IMPORT.md](41_DATA_IMPORT.md) — Nhập dữ liệu ban đầu (Excel/CSV) | ✅ |

### Frontend / UI
| [16_UI_UX_DESIGN_SYSTEM.md](16_UI_UX_DESIGN_SYSTEM.md) — Hệ thiết kế UI/UX | ⚠️ màn chủ đã gom 6 nhóm |
| [08_OWNER_STAFF_UI_SPEC.md](08_OWNER_STAFF_UI_SPEC.md) — Spec UI chủ/nhân viên | 🗄 spec MVP cũ; xem 27 + 36 |
| [09_KIOSK_APP_SPEC.md](09_KIOSK_APP_SPEC.md) — Spec kiosk | ⚠️ "design" — kiosk đã build |
| [37_KIOSK_STORE_MAP.md](37_KIOSK_STORE_MAP.md) — Sơ đồ & chỉ đường kiosk | ✅ |
| [36_STAFF_MOBILE_POS_PLAN.md](36_STAFF_MOBILE_POS_PLAN.md) — POS nhân viên (Cago-native /pos/sell) | ✅ nguồn đúng cho POS |

### Chatbot / Trợ lý
| [25_CHATBOT_ARCHITECTURE.md](25_CHATBOT_ARCHITECTURE.md) — Kiến trúc chatbot | ⚠️ ghi "design" — đã build (`cago/chatbot/*`) |
| [10_CHATBOT_RAG_SPEC.md](10_CHATBOT_RAG_SPEC.md) — Spec RAG | ⚠️ "design" — đã build |

### Bảo mật & an toàn
| [12_SECURITY_AND_SAFETY.md](12_SECURITY_AND_SAFETY.md) — Bảo mật + an toàn hoá chất | ✅ |
| [18_CODING_STANDARDS.md](18_CODING_STANDARDS.md) — Chuẩn code (whitelist/DTO/role) | ✅ |

### Vận hành & triển khai
| [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md) — Go-live: TLS (Caddy), backup, QA thiết bị | ✅ nguồn đúng cho deploy |
| [33_OPERATIONS_RESTORE_ROLLBACK.md](33_OPERATIONS_RESTORE_ROLLBACK.md) — Backup/Restore/Rollback | ✅ |
| [19_DEPLOYMENT_PLAN.md](19_DEPLOYMENT_PLAN.md) — Kế hoạch triển khai | ⚠️ thiếu Caddy/backup (xem 38) |
| [23_HARDENING_CHECKLIST.md](23_HARDENING_CHECKLIST.md) — Checklist hardening | ⚠️ thay bằng 38 |
| [14_OPERATIONS_AND_TRAINING.md](14_OPERATIONS_AND_TRAINING.md) — Vận hành & đào tạo | ⚠️ phần POS cũ |

### Kiểm thử
| [13_TEST_PLAN.md](13_TEST_PLAN.md) — Kế hoạch test | ⚠️ thiếu test tự động hiện có |
| [32_E2E_REVIEW.md](32_E2E_REVIEW.md) — Soát E2E | ⚠️ có banner "snapshot cũ" |

### Nghiên cứu & phân tích
| [26_COMPETITIVE_RESEARCH_AND_PLAN.md](26_COMPETITIVE_RESEARCH_AND_PLAN.md) — Đối thủ & kế hoạch | ✅ |
| [31_MARKET_RESEARCH_2026.md](31_MARKET_RESEARCH_2026.md) — Nghiên cứu thị trường 2026 | ✅ |
| [30_FEATURE_COVERAGE_GAP_ANALYSIS.md](30_FEATURE_COVERAGE_GAP_ANALYSIS.md) — Phủ tính năng & khoảng trống | ⚠️ vài mục "chưa build" nay đã có |
| [24_KNOWN_LIMITATIONS.md](24_KNOWN_LIMITATIONS.md) — Giới hạn & quyết định đã biết | ✅ |
| [04_POS_STRATEGY.md](04_POS_STRATEGY.md) — Chiến lược POS | ⚠️ xem 36 (Cago-native) |
| [11_IMPLEMENTATION_BACKLOG.md](11_IMPLEMENTATION_BACKLOG.md) — Backlog | 🗄 mốc milestone cũ |

---

## 🗄 Lưu trữ (đã bị thay thế — chỉ để tra lịch sử)

> **POS Awesome đã được GỠ HẲN** (kể cả các tài liệu đánh giá 20/21/28/29/34/35 — đã xoá). POS hiện
> tại là **Cago-native `/pos/sell`** (xem [36](36_STAFF_MOBILE_POS_PLAN.md)).

| [MILESTONE_0_1_SETUP.md](MILESTONE_0_1_SETUP.md) · [MILESTONE_0_1_TEST.md](MILESTONE_0_1_TEST.md) · [MILESTONE_3_6_UI.md](MILESTONE_3_6_UI.md) | 🗄 nhật ký build cũ (UI mô tả Frappe-native, nay Next.js) |

---

## Việc nên cập nhật tiếp (đề xuất, chưa làm)
- Viết lại chi tiết **06/07** cho khớp (lô, ca/cashier, loyalty, đa đơn vị, `cago_recommended`) — hiện đã gắn banner "thực tế" + có [39](39_API_REFERENCE.md)/[07] đối chiếu.
- Viết lại chi tiết **15/17** sang Next.js + `web/` — hiện đã gắn banner trỏ [27](27_FRONTEND_MIGRATION_NEXTJS.md)/[40](40_FRONTEND_DEV_GUIDE.md).

> Đã bổ sung các khoảng trống: API reference (39), Frontend dev guide (40), Data import (41).
> POS Awesome đã được **gỡ sạch** khỏi code + docs.
