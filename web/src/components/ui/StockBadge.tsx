/** Stock status as a glanceable pill: green = in stock ("Còn hàng/nhiều/N đv"), amber = low
 *  ("Còn ít" / "Sắp hết" / "Sắp nhập"), red = out ("Hết hàng"). Matches the backend's canonical
 *  statuses (Hết hàng / Còn ít / Còn hàng — see cago dto.stock_status_for). Pure presentational so it
 *  lives in its own tiny module (shared by POS owner/staff screens AND the kiosk without dragging the
 *  big owner/Shared bundle into the kiosk route). */
export function StockBadge({ status }: { status?: string | null }) {
  if (!status) return null; // blank status → render nothing (was an empty green pill)
  const s = status.toLowerCase();
  const out = s.includes("hết hàng"); // "Hết hàng", "⚠ Hết hàng"
  const low = !out && (s.includes("còn ít") || s.includes("sắp")); // "Còn ít", "Sắp hết", "Sắp nhập"
  const tone = out ? "bg-red-50 text-red-600" : low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  const dot = out ? "bg-red-500" : low ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-sm font-semibold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}
