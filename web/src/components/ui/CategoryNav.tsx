"use client";

import type { Category } from "@/lib/types";

/**
 * Reusable category switcher. `variant="chips"` is a horizontal strip (phones);
 * `variant="sidebar"` is a vertical list (tablet/desktop). Both show top-level
 * categories plus the children of the active branch, and an "All" entry. The
 * caller decides which variant to render at which breakpoint.
 */
export function CategoryNav({
  cats,
  active,
  onPick,
  variant,
  allLabel = "Tất cả",
}: {
  cats: Category[];
  active: string;
  onPick: (category: string) => void;
  variant: "chips" | "sidebar";
  allLabel?: string;
}) {
  const isActiveBranch = (t: Category) => t.category === active || (t.children || []).some((c) => c.category === active);

  if (variant === "chips") {
    const strip: { category: string; icon: string; label: string; child?: boolean; on: boolean }[] = [
      { category: "", icon: "🛒", label: allLabel, on: active === "" },
    ];
    for (const t of cats) {
      strip.push({ category: t.category, icon: t.icon, label: t.category, on: t.category === active });
      if ((t.children?.length || 0) > 0 && isActiveBranch(t)) {
        for (const c of t.children!) strip.push({ category: c.category, icon: c.icon, label: c.category, child: true, on: c.category === active });
      }
    }
    return (
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {strip.map((c) => (
          <button
            key={`${c.child ? "c" : "p"}:${c.category || "__all"}`}
            onClick={() => onPick(c.category)}
            className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold ${
              c.on ? "border-brand bg-brand text-white" : c.child ? "border-emerald-200 bg-emerald-50 text-brand-dark" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span>{c.child ? "›" : c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  const Row = ({ icon, label, count, on, child, onClick }: { icon: string; label: string; count?: number; on: boolean; child?: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold ${
        on ? "bg-brand text-white" : child ? "text-slate-600 hover:bg-slate-100" : "text-slate-700 hover:bg-slate-100"
      } ${child ? "pl-6" : ""}`}
    >
      <span>{child ? "›" : icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && count > 0 && <span className={`text-xs ${on ? "text-white/80" : "text-slate-400"}`}>{count}</span>}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-1.5">
      <Row icon="🛒" label={allLabel} on={active === ""} onClick={() => onPick("")} />
      {cats.map((t) => (
        <div key={t.category}>
          <Row icon={t.icon} label={t.category} count={t.count} on={t.category === active} onClick={() => onPick(t.category)} />
          {(t.children?.length || 0) > 0 &&
            isActiveBranch(t) &&
            t.children!.map((c) => (
              <Row key={c.category} icon={c.icon} label={c.category} count={c.count} on={c.category === active} child onClick={() => onPick(c.category)} />
            ))}
        </div>
      ))}
    </div>
  );
}
