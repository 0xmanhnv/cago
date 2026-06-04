"use client";

// Big touch-friendly 0–9 keypad for entering a PIN. `len` dots show progress; the parent owns the
// value and decides what to do when it reaches the PIN length.
export function Keypad({
  value,
  onPress,
  onDelete,
  len = 4,
  shake = false,
}: {
  value: string;
  onPress: (d: string) => void;
  onDelete: () => void;
  len?: number;
  shake?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="w-[280px]">
      <div className={`mb-6 flex justify-center gap-3 ${shake ? "animate-shake" : ""}`}>
        {Array.from({ length: len }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${i < value.length ? "border-brand bg-brand" : "border-slate-300"}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => onPress(k)}
            className="min-h-[64px] rounded-2xl bg-white text-2xl font-extrabold text-slate-700 shadow-soft active:scale-95"
          >
            {k}
          </button>
        ))}
        <span />
        <button
          onClick={() => onPress("0")}
          className="min-h-[64px] rounded-2xl bg-white text-2xl font-extrabold text-slate-700 shadow-soft active:scale-95"
        >
          0
        </button>
        <button
          onClick={onDelete}
          className="min-h-[64px] rounded-2xl bg-slate-100 text-2xl font-extrabold text-slate-500 active:scale-95"
          aria-label="Xoá"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
