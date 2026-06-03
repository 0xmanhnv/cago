# Cago — Documentation Index (Home)

Cago is an ERPNext v16 / Frappe customization + a decoupled Next.js front end for a rural
Vietnamese agricultural-supplies shop ("Minh Tuyết").

**Language convention:** technical docs are in **English**; the **end-user guides** under
[`user/`](user/) are in **Vietnamese** (their audience is the shop owner & staff).

Status legend: ✅ current · ⚠️ has stale parts (a banner at the top points to the source of truth)
· 🗄 archived (historical, superseded — see [`archive/`](archive/)).

---

## 📘 User guides (`user/`, Vietnamese)

| Doc | For |
|---|---|
| [user/HUONG_DAN_CHU.md](user/HUONG_DAN_CHU.md) — owner quick start (the 6 home groups) | Owner |
| [user/HUONG_DAN_CHU_CHI_TIET.md](user/HUONG_DAN_CHU_CHI_TIET.md) — owner detailed guide | Owner |
| [user/HUONG_DAN_NHAN_VIEN.md](user/HUONG_DAN_NHAN_VIEN.md) — staff selling guide | Staff |
| [user/CAU_HOI_THUONG_GAP.md](user/CAU_HOI_THUONG_GAP.md) — FAQ / quick fixes | Owner & staff |
| [user/NHAP_DU_LIEU_CSV.md](user/NHAP_DU_LIEU_CSV.md) + [catalog template](user/products_import_template.csv) — CSV product import | Owner |

> The app also has a built-in **📖 Hướng dẫn** screen (under Store Settings).

---

## 🛠 Technical docs (English)

### Getting started & architecture
| Doc | Status |
|---|---|
| [42_CAI_DAT.md](42_CAI_DAT.md) — **Install from scratch** (Docker: build → up → login → load catalog) | ✅ |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) — architecture | ⚠️ POS section changed (see 36) |
| [27_FRONTEND_MIGRATION_NEXTJS.md](27_FRONTEND_MIGRATION_NEXTJS.md) — Next.js migration | ✅ source of truth for the front end |
| [17_REPO_STRUCTURE.md](17_REPO_STRUCTURE.md) — repo layout + the 3 data layers | ✅ |
| [01_PRD.md](01_PRD.md) — product requirements | ✅ |
| [03_ERPNEXT_CAPABILITY_MAP.md](03_ERPNEXT_CAPABILITY_MAP.md) — what ERPNext provides | ✅ |
| [15_TECH_STACK_AND_ENGINEERING_GUIDE.md](15_TECH_STACK_AND_ENGINEERING_GUIDE.md) — tech stack | ⚠️ banner → migrated to Next.js |

### API & development
| [39_API_REFERENCE.md](39_API_REFERENCE.md) — `cago.api.*` reference (from code) | ✅ |
| [40_FRONTEND_DEV_GUIDE.md](40_FRONTEND_DEV_GUIDE.md) — front-end dev guide (`web/`) | ✅ |
| [18_CODING_STANDARDS.md](18_CODING_STANDARDS.md) — coding standards | ✅ |

### Data & Frappe customization
| [06_ERPNEXT_CUSTOMIZATION.md](06_ERPNEXT_CUSTOMIZATION.md) — custom fields / DocTypes | ⚠️ banner → see code |
| [07_DATA_MODEL.md](07_DATA_MODEL.md) — data model / DTOs | ⚠️ banner → see dto.py + 39 |
| [05_PYTHON_SERVICE_STRATEGY.md](05_PYTHON_SERVICE_STRATEGY.md) — Python services (no Go) | ✅ |

### UI / POS / Kiosk
| [36_STAFF_MOBILE_POS_PLAN.md](36_STAFF_MOBILE_POS_PLAN.md) — Cago-native POS `/pos/sell` | ✅ source of truth for POS |
| [16_UI_UX_DESIGN_SYSTEM.md](16_UI_UX_DESIGN_SYSTEM.md) — UI/UX design system | ⚠️ home regrouped into 6 sections |
| [09_KIOSK_APP_SPEC.md](09_KIOSK_APP_SPEC.md) — kiosk spec | ⚠️ kiosk is built |
| [37_KIOSK_STORE_MAP.md](37_KIOSK_STORE_MAP.md) — store map & wayfinding | ✅ |

### Chatbot / assistant
| [25_CHATBOT_ARCHITECTURE.md](25_CHATBOT_ARCHITECTURE.md) — chatbot architecture | ⚠️ built (`cago/chatbot/*`) |
| [10_CHATBOT_RAG_SPEC.md](10_CHATBOT_RAG_SPEC.md) — RAG spec | ⚠️ built |

### Security & safety
| [12_SECURITY_AND_SAFETY.md](12_SECURITY_AND_SAFETY.md) — security + chemical safety | ✅ |

### Operations & deployment
| [38_GO_LIVE_RUNBOOK.md](38_GO_LIVE_RUNBOOK.md) — go-live: TLS (Caddy), backup, device QA | ✅ source of truth for deploy |
| [33_OPERATIONS_RESTORE_ROLLBACK.md](33_OPERATIONS_RESTORE_ROLLBACK.md) — backup / restore / rollback | ✅ |
| [19_DEPLOYMENT_PLAN.md](19_DEPLOYMENT_PLAN.md) — deployment plan | ⚠️ Caddy/backup added in 38 |
| [23_HARDENING_CHECKLIST.md](23_HARDENING_CHECKLIST.md) — hardening checklist | ⚠️ superseded by 38 |
| [14_OPERATIONS_AND_TRAINING.md](14_OPERATIONS_AND_TRAINING.md) — operations & training | ⚠️ POS section dated |

### Testing
| [13_TEST_PLAN.md](13_TEST_PLAN.md) — test plan | ⚠️ predates the current automated suite |
| [32_E2E_REVIEW.md](32_E2E_REVIEW.md) — E2E review | ⚠️ stale-snapshot banner |

### Research & analysis (Vietnamese — VN-market research, kept in source language)
| [26_COMPETITIVE_RESEARCH_AND_PLAN.md](26_COMPETITIVE_RESEARCH_AND_PLAN.md) — competitors & plan | ✅ |
| [31_MARKET_RESEARCH_2026.md](31_MARKET_RESEARCH_2026.md) — VN market research 2026 | ✅ |
| [30_FEATURE_COVERAGE_GAP_ANALYSIS.md](30_FEATURE_COVERAGE_GAP_ANALYSIS.md) — coverage & gaps | ⚠️ some items now built |
| [24_KNOWN_LIMITATIONS.md](24_KNOWN_LIMITATIONS.md) — limitations & decisions | ✅ |
| [04_POS_STRATEGY.md](04_POS_STRATEGY.md) — POS strategy | ⚠️ banner → Cago-native (36) |

---

## 🗄 `archive/` (historical — superseded)

> **POS Awesome was evaluated then fully removed** (its evaluation docs were deleted). The POS is
> **Cago-native `/pos/sell`** (see [36](36_STAFF_MOBILE_POS_PLAN.md)).

| [archive/08_OWNER_STAFF_UI_SPEC.md](archive/08_OWNER_STAFF_UI_SPEC.md) — old MVP UI spec (now 27 + 36) |
| [archive/11_IMPLEMENTATION_BACKLOG.md](archive/11_IMPLEMENTATION_BACKLOG.md) — milestone backlog |
| [archive/MILESTONE_0_1_SETUP.md](archive/MILESTONE_0_1_SETUP.md) · [archive/MILESTONE_0_1_TEST.md](archive/MILESTONE_0_1_TEST.md) · [archive/MILESTONE_3_6_UI.md](archive/MILESTONE_3_6_UI.md) — old build logs |

---

## Notes
- ⚠️ docs carry a top banner pointing to the source of truth (code: `cago/setup/custom_fields.py`,
  `cago/utils/dto.py`, [39](39_API_REFERENCE.md)); their detailed bodies aren't kept in lock-step
  with the code on purpose (the code is canonical).
- The two VN research docs (26, 31) stay in Vietnamese — they are research about the Vietnamese
  market; only English is required for the rest.
- Recommended deploy order: **[42](42_CAI_DAT.md) (install) → [38](38_GO_LIVE_RUNBOOK.md) (go-live) → load real catalog**.
