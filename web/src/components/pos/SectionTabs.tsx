"use client";

import { usePathname, useRouter } from "next/navigation";

// Sub-tabs shared across a domain's screens so the user can move LATERALLY between related views
// (Sản phẩm ↔ Loại hàng ↔ Khuyên dùng ↔ In tem) instead of bouncing back to home — the "feature hub
// with internal sub-features" pattern. Placed right under the BackBar on each screen in the group.
const GROUPS = {
  products: [
    { href: "/pos/products", label: "📦 Sản phẩm" },
    { href: "/pos/categories", label: "🗂 Loại hàng" },
    { href: "/pos/recommended", label: "⭐ Khuyên dùng" },
    { href: "/pos/labels", label: "🏷 In tem" },
    { href: "/pos/health", label: "🩺 Kiểm tra" },
  ],
} as const;

export function SectionTabs({ group }: { group: keyof typeof GROUPS }) {
  const path = usePathname() || "";
  const router = useRouter();
  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
      {GROUPS[group].map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <button
            key={t.href}
            onClick={() => !on && router.push(t.href)}
            aria-current={on ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              on ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 active:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
