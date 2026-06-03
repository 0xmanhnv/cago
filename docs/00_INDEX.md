# 00 — Mục lục tài liệu Cago

Tài liệu chia làm **2 bộ**:
- **📘 Tài liệu sử dụng** (`user/`) — cho chủ/nhân viên, không cần kỹ thuật.
- **🛠 Tài liệu kỹ thuật** (`docs/` gốc) — cho người phát triển/vận hành.

Tài liệu lịch sử nằm trong **`archive/`** (giữ tra cứu, KHÔNG phản ánh hệ thống hiện tại).
Trạng thái: ✅ hiện hành · ⚠️ còn nội dung cũ (đã gắn banner trỏ nguồn đúng).

---

## 📘 Tài liệu sử dụng — `user/`

| Tài liệu | Cho ai |
|---|---|
| [user/HUONG_DAN_CHU.md](user/HUONG_DAN_CHU.md) — Hướng dẫn nhanh cho chủ (6 nhóm chức năng) | Chủ |
| [user/HUONG_DAN_CHU_CHI_TIET.md](user/HUONG_DAN_CHU_CHI_TIET.md) — Hướng dẫn chi tiết (tra giá, sửa giá, ghi nợ, báo cáo) | Chủ |
| [user/HUONG_DAN_NHAN_VIEN.md](user/HUONG_DAN_NHAN_VIEN.md) — Bán/trả/đổi/offline/ghi nợ | Nhân viên |
| [user/CAU_HOI_THUONG_GAP.md](user/CAU_HOI_THUONG_GAP.md) — Câu hỏi thường gặp & xử lý nhanh | Chủ & NV |
| [user/NHAP_DU_LIEU_CSV.md](user/NHAP_DU_LIEU_CSV.md) + [products_import_template.csv](user/products_import_template.csv) — Nhập sản phẩm bằng CSV | Chủ/kỹ thuật |
| [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md) — Mục C (QA thiết bị) & D (dọn dữ liệu) | Chủ/kỹ thuật |

> Trong app cũng có nút **📖 Hướng dẫn** (Cài đặt cửa hàng).

---

## 🛠 Tài liệu kỹ thuật

### Tổng quan & kiến trúc
| Tài liệu | Trạng thái |
|---|---|
| [01_PRD.md](01_PRD.md) — Yêu cầu sản phẩm | ✅ |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) — Kiến trúc | ⚠️ phần POS đã đổi (xem 36) |
| [27_FRONTEND_MIGRATION_NEXTJS.md](27_FRONTEND_MIGRATION_NEXTJS.md) — Chuyển frontend sang Next.js | ✅ nguồn đúng cho frontend |
| [03_ERPNEXT_CAPABILITY_MAP.md](03_ERPNEXT_CAPABILITY_MAP.md) — ERPNext cung cấp gì | ✅ |
| [17_REPO_STRUCTURE.md](17_REPO_STRUCTURE.md) — Cấu trúc repo | ✅ viết lại đúng thực tế |
| [15_TECH_STACK_AND_ENGINEERING_GUIDE.md](15_TECH_STACK_AND_ENGINEERING_GUIDE.md) — Tech stack | ⚠️ banner → đã migrate Next.js |

### API & phát triển
| [39_API_REFERENCE.md](39_API_REFERENCE.md) — Tham chiếu API `cago.api.*` (sinh từ code) | ✅ |
| [40_FRONTEND_DEV_GUIDE.md](40_FRONTEND_DEV_GUIDE.md) — Hướng dẫn dev frontend (`web/`) | ✅ |

### Dữ liệu & tuỳ biến Frappe
| [06_ERPNEXT_CUSTOMIZATION.md](06_ERPNEXT_CUSTOMIZATION.md) — Custom fields/DocTypes | ⚠️ banner → xem code |
| [07_DATA_MODEL.md](07_DATA_MODEL.md) — Mô hình dữ liệu / DTO | ⚠️ banner → xem dto.py + 39 |
| [05_PYTHON_SERVICE_STRATEGY.md](05_PYTHON_SERVICE_STRATEGY.md) — Dịch vụ Python (không Go) | ✅ |

### Frontend / UI / POS / Kiosk
| [36_STAFF_MOBILE_POS_PLAN.md](36_STAFF_MOBILE_POS_PLAN.md) — POS Cago-native `/pos/sell` | ✅ nguồn đúng cho POS |
| [16_UI_UX_DESIGN_SYSTEM.md](16_UI_UX_DESIGN_SYSTEM.md) — Hệ thiết kế UI/UX | ⚠️ màn chủ đã gom 6 nhóm |
| [09_KIOSK_APP_SPEC.md](09_KIOSK_APP_SPEC.md) — Spec kiosk | ⚠️ kiosk đã build |
| [37_KIOSK_STORE_MAP.md](37_KIOSK_STORE_MAP.md) — Sơ đồ & chỉ đường kiosk | ✅ |

### Chatbot / Trợ lý
| [25_CHATBOT_ARCHITECTURE.md](25_CHATBOT_ARCHITECTURE.md) — Kiến trúc chatbot | ⚠️ đã build (`cago/chatbot/*`) |
| [10_CHATBOT_RAG_SPEC.md](10_CHATBOT_RAG_SPEC.md) — Spec RAG | ⚠️ đã build |

### Bảo mật & an toàn
| [12_SECURITY_AND_SAFETY.md](12_SECURITY_AND_SAFETY.md) — Bảo mật + an toàn hoá chất | ✅ |
| [18_CODING_STANDARDS.md](18_CODING_STANDARDS.md) — Chuẩn code (whitelist/DTO/role) | ✅ |

### Vận hành & triển khai
| [42_CAI_DAT.md](42_CAI_DAT.md) — **Cài đặt từ đầu** (Docker: build → up → login → nạp catalog) | ✅ |
| [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md) — Go-live: TLS (Caddy), backup, QA thiết bị | ✅ nguồn đúng cho deploy |
| [33_OPERATIONS_RESTORE_ROLLBACK.md](33_OPERATIONS_RESTORE_ROLLBACK.md) — Backup/Restore/Rollback | ✅ |
| [19_DEPLOYMENT_PLAN.md](19_DEPLOYMENT_PLAN.md) — Kế hoạch triển khai | ⚠️ thiếu Caddy/backup (xem 38) |
| [23_HARDENING_CHECKLIST.md](23_HARDENING_CHECKLIST.md) — Checklist hardening | ⚠️ thay bằng 38 |
| [14_OPERATIONS_AND_TRAINING.md](14_OPERATIONS_AND_TRAINING.md) — Vận hành & đào tạo | ⚠️ phần POS cũ |

### Kiểm thử
| [13_TEST_PLAN.md](13_TEST_PLAN.md) — Kế hoạch test | ⚠️ thiếu test tự động hiện có |
| [32_E2E_REVIEW.md](32_E2E_REVIEW.md) — Soát E2E | ⚠️ banner "snapshot cũ" |

### Nghiên cứu & phân tích
| [26_COMPETITIVE_RESEARCH_AND_PLAN.md](26_COMPETITIVE_RESEARCH_AND_PLAN.md) — Đối thủ & kế hoạch | ✅ |
| [31_MARKET_RESEARCH_2026.md](31_MARKET_RESEARCH_2026.md) — Nghiên cứu thị trường 2026 | ✅ |
| [30_FEATURE_COVERAGE_GAP_ANALYSIS.md](30_FEATURE_COVERAGE_GAP_ANALYSIS.md) — Phủ tính năng & khoảng trống | ⚠️ vài mục đã có |
| [24_KNOWN_LIMITATIONS.md](24_KNOWN_LIMITATIONS.md) — Giới hạn & quyết định | ✅ |
| [04_POS_STRATEGY.md](04_POS_STRATEGY.md) — Chiến lược POS | ⚠️ banner → Cago-native (36) |

---

## 🗄 `archive/` (lịch sử — đã bị thay thế)

> **POS Awesome đã được GỠ HẲN** (kể cả các tài liệu đánh giá — đã xoá). POS hiện tại là
> **Cago-native `/pos/sell`** ([36](36_STAFF_MOBILE_POS_PLAN.md)).

| [archive/08_OWNER_STAFF_UI_SPEC.md](archive/08_OWNER_STAFF_UI_SPEC.md) — Spec UI MVP cũ (nay 27 + 36) |
| [archive/11_IMPLEMENTATION_BACKLOG.md](archive/11_IMPLEMENTATION_BACKLOG.md) — Backlog theo milestone |
| [archive/MILESTONE_0_1_SETUP.md](archive/MILESTONE_0_1_SETUP.md) · [archive/MILESTONE_0_1_TEST.md](archive/MILESTONE_0_1_TEST.md) · [archive/MILESTONE_3_6_UI.md](archive/MILESTONE_3_6_UI.md) — nhật ký build cũ |

---

## Ghi chú
- Các doc ⚠️ đã có **banner** ở đầu file trỏ tới nguồn đúng — chưa viết lại chi tiết (nội dung cốt lõi là code: `cago/setup/custom_fields.py`, `cago/utils/dto.py`, [39](39_API_REFERENCE.md)).
- Khoảng trống đã bổ sung: API reference (39), Frontend dev guide (40), nhập CSV (user/).
- POS Awesome đã **gỡ sạch** khỏi code; chỉ còn nhắc trong các doc `archive/`.
