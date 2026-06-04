"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./OwnerShared";
import { PageLoading } from "@/components/ui/Loading";

type Item = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string; fix_href?: string | null };
type Group = { title: string; items: Item[] };
type Data = { groups: Group[]; blockers: number; warnings: number; ready: boolean };

const ICON = { ok: "✅", warn: "⚠️", fail: "❌" } as const;
const RING = { ok: "border-emerald-200", warn: "border-amber-300", fail: "border-red-300" } as const;

/** "Sẵn sàng khai trương?" — a go/no-go the owner runs before opening to the public. Blockers (❌)
 *  must be fixed; warnings (⚠️) are nice-to-have. (cago.api.readiness.golive_check) */
export function Readiness() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);

  const load = () =>
    frappeCall<Data>("cago.api.readiness.golive_check", {}).then(setD).catch(() => setD(null));
  useEffect(() => {
    load();
  }, []);

  if (!d) return <PageLoading />;

  return (
    <div className="pb-10">
      <BackBar onBack={() => goBackSmart(router)} title="🚩 Sẵn sàng khai trương?" />

      <div className={`mb-4 rounded-2xl p-4 text-center font-extrabold ${d.ready ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
        {d.ready ? (
          <>
            <div className="text-4xl">🎉</div>
            <div className="mt-1 text-lg">Sẵn sàng mở cửa!</div>
            {d.warnings > 0 && <div className="text-sm font-medium text-amber-700">Còn {d.warnings} mục nên hoàn thiện thêm.</div>}
          </>
        ) : (
          <>
            <div className="text-4xl">🛠️</div>
            <div className="mt-1 text-lg">Còn {d.blockers} việc cần làm trước khi mở cửa</div>
            {d.warnings > 0 && <div className="text-sm font-medium">và {d.warnings} mục nên hoàn thiện thêm.</div>}
          </>
        )}
      </div>

      {d.groups.map((g) => (
        <div key={g.title} className="mb-4">
          <h2 className="mb-1.5 ml-1 font-extrabold text-brand-dark">{g.title}</h2>
          <div className="space-y-2">
            {g.items.map((i) => (
              <div key={i.key} className={`flex items-center gap-3 rounded-xl border-2 bg-white p-3 ${RING[i.status]}`}>
                <span className="text-xl">{ICON[i.status]}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800">{i.label}</div>
                  <div className="text-sm text-slate-500">{i.detail}</div>
                </div>
                {i.status !== "ok" && i.fix_href && (
                  <button onClick={() => router.push(i.fix_href!)} className="shrink-0 rounded-lg bg-brand-light px-3 py-1.5 text-sm font-bold text-brand-dark">
                    Sửa →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={load} className="mx-auto block rounded-xl border-2 border-emerald-300 px-5 py-2.5 font-bold text-brand-dark">
        🔄 Kiểm tra lại
      </button>
    </div>
  );
}
