"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart, ProductPicker } from "./Shared";

interface Label {
  item_code: string;
  display_name: string;
  price_text: string;
  barcode: string;
  shelf_location: string;
}

export function Labels() {
  const router = useRouter();
  const [codes, setCodes] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, Label>>({});
  const [picking, setPicking] = useState(false);

  const add = async (code: string) => {
    setPicking(false);
    if (codes.includes(code)) return;
    try {
      const [l] = await frappeCall<Label[]>("cago.api.catalog.label_data", { codes: JSON.stringify([code]) }, { method: "GET" });
      if (l) {
        setCodes((c) => [...c, code]);
        setLabels((m) => ({ ...m, [code]: l }));
      }
    } catch {
      /* ignore */
    }
  };

  const print = () => {
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tags = codes
      .map((c) => labels[c])
      .filter(Boolean)
      .map(
        (l) => `
        <div class="tag">
          <div class="name">${esc(l.display_name)}</div>
          <div class="price">${esc(l.price_text)}</div>
          <div class="meta">${esc(l.barcode)}${l.shelf_location ? " · kệ " + esc(l.shelf_location) : ""}</div>
        </div>`,
      )
      .join("");
    const w = window.open("", "_blank", "width=720,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box} body{font-family:system-ui,Arial;margin:0;padding:8px}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .tag{border:1px dashed #888;border-radius:8px;padding:10px;text-align:center;page-break-inside:avoid}
      .name{font-weight:700;font-size:15px;min-height:38px}
      .price{font-weight:800;font-size:26px;color:#15803d;margin:4px 0}
      .meta{font-family:monospace;font-size:12px;color:#555;letter-spacing:1px}
      @media print{.tag{border-color:#bbb}}
    </style></head><body><div class="grid">${tags}</div></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  if (picking) return <ProductPicker title="Chọn sản phẩm in tem" onBack={() => setPicking(false)} onPick={add} />;

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="🏷 In tem giá / kệ" />
      <button onClick={() => setPicking(true)} className="mb-3 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white">
        ➕ Thêm sản phẩm
      </button>
      {codes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-white/60 p-6 text-center text-slate-500">
          Chưa chọn sản phẩm nào. Bấm “Thêm sản phẩm” để chọn rồi in tem.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {codes.map((c) => {
              const l = labels[c];
              if (!l) return null;
              return (
                <div key={c} className="relative rounded-xl border border-emerald-100 bg-white p-3 text-center shadow-sm">
                  <button
                    onClick={() => setCodes((x) => x.filter((k) => k !== c))}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700"
                    aria-label="Bỏ"
                  >
                    ×
                  </button>
                  <div className="min-h-[36px] text-sm font-bold">{l.display_name}</div>
                  <div className="text-xl font-extrabold text-brand">{l.price_text}</div>
                  <div className="font-mono text-xs text-slate-500">{l.barcode}{l.shelf_location ? ` · kệ ${l.shelf_location}` : ""}</div>
                </div>
              );
            })}
          </div>
          <button onClick={print} className="mt-4 min-h-touch w-full rounded-xl bg-blue-600 font-extrabold text-white">
            🖨 In {codes.length} tem
          </button>
        </>
      )}
    </div>
  );
}
