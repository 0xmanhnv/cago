"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast } from "@/components/ui/toast";
import { BackBar, goBackSmart, DraftModal } from "./Shared";
import { uomLabel } from "@/lib/uom";

import { PageLoading } from "@/components/ui/Loading";
interface Suggest {
  item_code: string;
  display_name: string;
  on_hand_text: string;
  suggest_qty: number;
  uom: string;
  shelf_location?: string;
  supplier_name: string;
}

type Pick = { on: boolean; qty: string };

export function Reorder() {
  const router = useRouter();
  const { boot } = useSession();
  const shop = boot?.brand || "Minh Tuyết";
  const [rows, setRows] = useState<Suggest[] | null>(null);
  const [pick, setPick] = useState<Record<string, Pick>>({});
  const [closed, setClosed] = useState<Set<string>>(new Set()); // collapsed suppliers (expanded by default)
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    frappeCall<Suggest[]>("cago.api.purchasing.reorder_suggestions", {}, { method: "GET" })
      .then((r) => {
        setRows(r || []);
        // Pre-fill the suggested qty so the common case is: tick the item → tạo đơn (no typing).
        const init: Record<string, Pick> = {};
        (r || []).forEach((it) => (init[it.item_code] = { on: false, qty: it.suggest_qty ? String(it.suggest_qty) : "" }));
        setPick(init);
      })
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <PageLoading />;

  const groups: Record<string, Suggest[]> = {};
  for (const r of rows) (groups[r.supplier_name] ||= []).push(r);

  const setOn = (code: string, on: boolean) => setPick((p) => ({ ...p, [code]: { ...(p[code] || { qty: "" }), on } }));
  const setQty = (code: string, qty: string) => setPick((p) => ({ ...p, [code]: { on: p[code]?.on ?? true, qty } }));
  const chosenIn = (items: Suggest[]) => items.filter((it) => pick[it.item_code]?.on);

  const qtyOf = (code: string) => parseFloat((pick[code]?.qty || "").replace(",", ".")) || 0;

  const buildList = (supplier: string, items: Suggest[]) => {
    const chosen = chosenIn(items);
    if (!chosen.length) {
      toast.error("Chọn ít nhất một mặt hàng (tích ô bên trái).");
      return;
    }
    // A ticked item MUST have a quantity > 0 — never let a "?"/0 line into the order.
    const missing = chosen.filter((it) => qtyOf(it.item_code) <= 0);
    if (missing.length) {
      toast.error(`Nhập số lượng (> 0) cho: ${missing.map((it) => it.display_name).join(", ")}`);
      return;
    }
    // Clean order to SEND the supplier — only what they need: shop name + items + qty. NO internal
    // stock ("còn X"), no "Chưa rõ NCC", no owner instructions (those go in the `note`, outside the copy).
    const head = ["ĐƠN ĐẶT HÀNG", `Cửa hàng: ${shop}`];
    if (supplier && supplier !== "Chưa rõ NCC") head.push(`Kính gửi: ${supplier}`);
    const lines = [...head, "————————————"];
    for (const it of chosen) lines.push(`• ${it.display_name}: ${qtyOf(it.item_code)} ${uomLabel(it.uom)}`);
    setDraft(lines.join("\n"));
  };

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="🛒 Gợi ý nhập hàng" />
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-emerald-100 bg-white p-6 text-center text-slate-500">
          Hiện chưa có mặt hàng nào dưới mức đặt lại. 👍
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Tích chọn mặt hàng cần nhập + sửa số lượng, rồi bấm <b>Tạo đơn nhập</b> để gửi NCC. Khi hàng về, vào
            <button onClick={() => router.push("/pos/receive")} className="mx-1 rounded-md bg-brand px-2 py-0.5 font-bold text-white">📥 Nhập hàng</button>
            ghi số lượng + giá nhập thật.
          </div>
          <div className="xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-3">
          {Object.entries(groups).map(([supplier, items]) => {
            const n = chosenIn(items).length;
            const allOn = n === items.length;
            const open = !closed.has(supplier);
            return (
              <div key={supplier} className="mb-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  {/* Title = collapse toggle (so you can hide a supplier you've handled and jump to the
                      next); select-all + create-order are separate controls. */}
                  <button onClick={() => setClosed((p) => { const s = new Set(p); s.has(supplier) ? s.delete(supplier) : s.add(supplier); return s; })} className="flex min-w-0 items-center gap-2 text-left font-extrabold text-brand-dark">
                    <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                    <span className="truncate">🚚 {supplier} <span className="text-sm font-normal text-slate-400">· {items.length} mặt hàng{n ? ` · chọn ${n}` : ""}</span></span>
                  </button>
                  <button
                    onClick={() => buildList(supplier, items)}
                    disabled={!n}
                    className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    📋 Tạo đơn{n ? ` (${n})` : ""}
                  </button>
                </div>
                {open && (
                  <button onClick={() => items.forEach((it) => setOn(it.item_code, !allOn))} className="mb-1 text-sm font-bold text-brand">
                    {allOn ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  </button>
                )}
                {open && items.map((it) => {
                  const p = pick[it.item_code] || { on: false, qty: "" };
                  return (
                    <div key={it.item_code} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
                      <button
                        onClick={() => setOn(it.item_code, !p.on)}
                        aria-label={p.on ? "Bỏ chọn" : "Chọn"}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold ${p.on ? "border-brand bg-brand text-white" : "border-slate-300 text-transparent"}`}
                      >
                        ✓
                      </button>
                      <button onClick={() => setOn(it.item_code, !p.on)} className="min-w-0 flex-1 text-left">
                        <div className="truncate font-bold">{it.display_name}</div>
                        <div className="text-sm text-slate-500">
                          Còn {it.on_hand_text}
                          {it.shelf_location ? ` · kệ ${it.shelf_location}` : ""}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          inputMode="numeric"
                          value={p.qty}
                          onChange={(e) => setQty(it.item_code, e.target.value.replace(/[^\d.]/g, ""))}
                          onFocus={() => !p.on && setOn(it.item_code, true)}
                          placeholder="SL"
                          className="h-10 w-16 rounded-lg border-2 border-emerald-300 text-center text-lg font-extrabold"
                        />
                        <span className="w-10 text-sm text-slate-500">{uomLabel(it.uom)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </>
      )}
      {draft !== null && (
        <DraftModal
          text={draft}
          title="🛒 Đơn đặt hàng (gửi NCC)"
          allowPrint
          note={
            <>
              ↗ Gửi danh sách trên cho nhà cung cấp (Sao chép / In).
              <br />↗ Khi hàng về: vào <b>📥 Nhập hàng</b> ghi số lượng + giá nhập — lúc đó tồn kho mới cập nhật.
            </>
          }
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
