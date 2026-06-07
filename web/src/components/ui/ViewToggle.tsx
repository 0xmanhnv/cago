"use client";

/**
 * The ☰ list / ▦ card segmented switch shared by the staff product grids (Bán hàng, Tìm hàng). Was
 * duplicated per-screen with the same markup; one component keeps the look identical.
 */
export function ViewToggle({ mode, onChange }: { mode: "list" | "card"; onChange: (m: "list" | "card") => void }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
      <button onClick={() => onChange("list")} aria-label="Dạng danh sách" className={`px-3.5 py-1.5 text-lg ${mode === "list" ? "bg-brand text-white" : "text-slate-600"}`}>
        ☰
      </button>
      <button onClick={() => onChange("card")} aria-label="Dạng thẻ" className={`px-3.5 py-1.5 text-lg ${mode === "card" ? "bg-brand text-white" : "text-slate-600"}`}>
        ▦
      </button>
    </div>
  );
}
