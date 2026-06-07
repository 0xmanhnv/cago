import { frappeCall } from "@/lib/api";
import { uomLabel } from "@/lib/uom";

// Shared thermal/A5 receipt printer — used by the till's reprint AND the Đơn-hàng history hub so a
// past sale prints exactly the same bill. Data comes from cago.api.sales.get_receipt (store header,
// lines, totals, safety note); only the paper geometry is chosen client-side per the shop's printer.
export interface Receipt {
  invoice: string;
  store: string;
  when: string;
  lines: { name: string; qty: number; uom: string; rate_text: string; amount_text: string }[];
  total_text: string;
  paid_text?: string | null;
  outstanding_text?: string | null;
  safety?: string | null;
}

export type PaperSize = "58" | "80" | "a5";
const PAPER: Record<PaperSize, { page: string; width: string; base: string; line: string; tot: string; label: string }> = {
  "58": { page: "58mm auto", width: "54mm", base: "11px", line: "10px", tot: "14px", label: "58mm" },
  "80": { page: "80mm auto", width: "76mm", base: "12px", line: "11px", tot: "16px", label: "80mm" },
  a5: { page: "A5", width: "135mm", base: "13px", line: "12px", tot: "18px", label: "A5 (giấy thường)" },
};
export const PAPER_KEY = "cago_pos_paper";
export const loadPaper = (): PaperSize => {
  const v = (typeof window !== "undefined" && window.localStorage?.getItem(PAPER_KEY)) || "58";
  return v === "80" || v === "a5" ? v : "58";
};

const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const qt = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

// Reprint a submitted invoice. Opens the print window SYNCHRONOUSLY (inside the click gesture) so a
// popup blocker can't kill it after the awaited fetch.
export async function printReceipt(invoice: string, size: PaperSize = loadPaper()) {
  const w = window.open("", "_blank", "width=380,height=640");
  const r = await frappeCall<Receipt>("cago.api.sales.get_receipt", { invoice }, { method: "GET" });
  const p = PAPER[size];
  const rows = r.lines
    .map(
      (l) =>
        `<div class="it"><div>${esc(l.name)}</div><div class="r">${qt(l.qty)} ${esc(uomLabel(l.uom))} x ${l.rate_text} = <b>${l.amount_text}</b></div></div>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.invoice)}</title>
  <style>@page{size:${p.page};margin:${size === "a5" ? "8mm" : "2mm"}}body{width:${p.width};font-family:monospace;font-size:${p.base};color:#000}
  h3{text-align:center;margin:2px 0}.c{text-align:center}.it{border-bottom:1px dashed #999;padding:2px 0}.r{font-size:${p.line}}
  .tot{font-weight:bold;font-size:${p.tot};text-align:right;margin-top:4px}.sf{font-size:9px;border-top:1px solid #000;margin-top:4px;padding-top:3px}</style>
  </head><body>
  <h3>${esc(r.store)}</h3>
  <div class="c">HOÁ ĐƠN BÁN HÀNG</div>
  <div class="c">${esc(r.when)} · ${esc(r.invoice)}</div>
  <hr>${rows}
  <div class="tot">TỔNG: ${r.total_text}</div>
  ${r.paid_text ? `<div class="r">Khách trả: ${r.paid_text}</div>` : ""}
  ${r.outstanding_text ? `<div class="r">Còn nợ: ${r.outstanding_text}</div>` : ""}
  ${r.safety ? `<div class="sf">${esc(r.safety)}</div>` : ""}
  <div class="c" style="margin-top:6px">Cảm ơn quý khách!</div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
