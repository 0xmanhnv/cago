"use client";

// Shared building blocks for clean, scannable data lists (search + filter tabs + date grouping
// + sticky headers). Kept simple/consistent with Cago's card style; mobile-first, big targets.

/** Group items preserving first-seen order (data is already sorted newest-first). */
export function groupOrdered<T>(items: T[], key: (x: T) => string): { label: string; items: T[] }[] {
  const order: string[] = [];
  const map: Record<string, T[]> = {};
  for (const it of items) {
    const k = key(it);
    if (!(k in map)) {
      map[k] = [];
      order.push(k);
    }
    map[k].push(it);
  }
  return order.map((label) => ({ label, items: map[label] }));
}

export interface Tab {
  key: string;
  label: string;
  count?: number;
}

export function FilterTabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="no-scrollbar mb-2.5 flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`min-h-[40px] whitespace-nowrap rounded-full px-4 text-sm font-bold ${
            active === t.key ? "bg-brand text-white shadow" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          {t.label}
          {t.count !== undefined ? ` · ${t.count}` : ""}
        </button>
      ))}
    </div>
  );
}

export function DateHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-[1] -mx-4 mb-2 mt-3 bg-[#eaf7ef]/90 px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-brand-dark backdrop-blur first:mt-0">
      {label}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      enterKeyHint="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mb-2.5 w-full rounded-xl border-2 border-slate-300 p-3 text-base"
    />
  );
}
