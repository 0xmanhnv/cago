// Display-only label for a unit of measure. DO NOT use this on a value that is sent back to the
// server in an API payload (quick_sale items[].uom, save_unit, …) — those must keep the REAL UOM
// (e.g. ERPNext's "Nos") or the sale/price posts against the wrong unit. Use it ONLY when rendering.
//
// Mirrors cago.utils.dto.UOM_LABELS: weight codes → Vietnamese, and ERPNext's default count unit
// "Nos"/"Unit" → "Cái" so it never shows to a Vietnamese shopper.
const LABELS: Record<string, string> = {
  kg10: "Yến",
  kg100: "Tạ",
  kg1000: "Tấn",
  Nos: "Cái",
  Unit: "Cái",
};

export function uomLabel(uom?: string | null): string {
  const u = (uom || "").trim();
  return LABELS[u] || u;
}
