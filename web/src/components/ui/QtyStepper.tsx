"use client";

/**
 * The shared − qty + control used everywhere a line quantity is edited (product grid card/list, the
 * cart panel, the product preview). Was copy-pasted 3× with slightly different sizes; one component
 * keeps them identical. `size="sm"` (h-9) is for tight rows like the cart, where the full-size touch
 * stepper made the price/total wrap; `size="md"` (h-11) is the finger-friendly grid default.
 * `onEdit` (optional) makes the middle a button that opens the keypad; without it the qty is static.
 */
export function QtyStepper({
  display,
  onDec,
  onInc,
  onEdit,
  size = "md",
}: {
  display: string;
  onDec: () => void;
  onInc: () => void;
  onEdit?: () => void;
  size?: "sm" | "md";
}) {
  const sq = size === "sm" ? "h-9 w-9 text-xl" : "h-11 w-11 text-2xl";
  const mid = size === "sm" ? "h-9 w-11 text-base" : "h-11 w-14 text-xl";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button onClick={onDec} className={`${sq} rounded-lg bg-slate-200 font-bold`}>−</button>
      {onEdit ? (
        <button onClick={onEdit} title="Bấm để nhập số lượng" className={`${mid} rounded-lg border-2 border-emerald-300 text-center font-extrabold`}>
          {display}
        </button>
      ) : (
        <span className={`${mid} flex items-center justify-center font-extrabold`}>{display}</span>
      )}
      <button onClick={onInc} className={`${sq} rounded-lg bg-brand font-bold text-white`}>＋</button>
    </div>
  );
}
