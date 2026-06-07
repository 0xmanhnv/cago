import type { ReactNode } from "react";

/**
 * The slim tinted summary strip shown above a list ("19 khách đang nợ · tổng …", "5 mặt hàng sắp
 * hết", …). Same shape was hand-written per screen in different colours; one component keeps the
 * padding/rounding/weight consistent and just swaps the tone.
 */
export function StatBanner({ tone = "amber", children }: { tone?: "red" | "amber" | "emerald" | "sky"; children: ReactNode }) {
  const tones: Record<string, string> = {
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return <div className={`mb-2 rounded-xl p-2.5 text-center font-bold ${tones[tone]}`}>{children}</div>;
}
