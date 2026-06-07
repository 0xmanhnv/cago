"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";

export type SortOption = { key: string; label: string };

/**
 * The "↓↑ <current sort>" pill + its options popup. ProductManager and InventoryOverview (and any
 * future list) had a byte-for-byte copy of this; one component keeps them identical. The popup itself
 * is the shared bottom Sheet, so it slides up + focus-traps + ESC-closes like every other sheet.
 */
export function SortControl({
  options,
  active,
  onChange,
  title = "Sắp xếp",
}: {
  options: SortOption[];
  active: string;
  onChange: (key: string) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.key === active)?.label ?? title;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600"
      >
        ↓↑ {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} variant="bottom" label={title}>
        <div className="mb-2 text-center text-lg font-extrabold text-brand-dark">{title}</div>
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => {
              setOpen(false);
              onChange(o.key);
            }}
            className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-lg ${active === o.key ? "bg-emerald-50 font-extrabold text-brand" : "text-slate-700"}`}
          >
            {o.label}
            {active === o.key && <span>✓</span>}
          </button>
        ))}
      </Sheet>
    </>
  );
}
