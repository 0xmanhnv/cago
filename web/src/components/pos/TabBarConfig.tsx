"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { BackBar, goBackSmart } from "@/components/owner/Shared";
import { ACTIONS, canRunAction, readTabbar, TABBAR_MAX, tabParts, writeTabbar } from "@/lib/posActions";

const DEFAULT_KEYS = ["sell", "debt", "product", "reports"];

// "Sửa thanh dưới" — configure the bottom tab bar SEPARATELY from "⭐ Hay dùng". Pick up to TABBAR_MAX
// navigable functions; 🏠 Trang chủ is always there. Saves instantly (writeTabbar) and the live bar at
// the bottom updates as you edit (via the change event BottomNav listens to).
export function TabBarConfig() {
  const router = useRouter();
  const { boot } = useSession();
  const [keys, setKeys] = useState<string[]>(() => {
    const saved = readTabbar();
    return saved.length ? saved : DEFAULT_KEYS;
  });

  const save = (next: string[]) => {
    setKeys(next);
    writeTabbar(next);
  };
  const add = (k: string) => keys.length < TABBAR_MAX && !keys.includes(k) && save([...keys, k]);
  const remove = (k: string) => save(keys.filter((x) => x !== k));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  const available = Object.keys(ACTIONS).filter(
    (k) => k !== "tabbar" && ACTIONS[k]?.href && canRunAction(ACTIONS[k], boot) && !keys.includes(k),
  );
  const full = keys.length >= TABBAR_MAX;

  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => goBackSmart(router)} title="📱 Sửa thanh dưới" />
      <p className="mb-3 ml-1 text-sm text-slate-500">
        Chọn tối đa <b>{TABBAR_MAX}</b> chức năng hay dùng để hiện ở <b>thanh dưới cùng</b>. <b>🏠 Trang chủ</b> luôn có. Sửa tới đâu áp dụng tới đó.
      </p>

      <h2 className="mb-2 ml-1 font-extrabold text-brand-dark">Đang ở thanh dưới</h2>
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-100 p-3">
        <span className="text-2xl leading-none">🏠</span>
        <div className="flex-1 font-bold">Trang chủ</div>
        <span className="text-sm font-bold text-slate-400">🔒 cố định</span>
      </div>
      {keys.map((k, i) => {
        const a = ACTIONS[k];
        if (!a) return null;
        const { icon, label } = tabParts(a.label);
        return (
          <div key={k} className="mb-2 flex items-center gap-2 rounded-xl bg-white p-3 shadow">
            <span className="text-2xl leading-none">{icon}</span>
            <div className="min-w-0 flex-1 truncate font-bold">{label}</div>
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-lg leading-none disabled:opacity-30">▲</button>
            <button onClick={() => move(i, 1)} disabled={i === keys.length - 1} aria-label="Xuống" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-lg leading-none disabled:opacity-30">▼</button>
            <button onClick={() => remove(k)} aria-label="Bỏ" className="rounded-lg bg-red-100 px-3 py-1.5 font-bold text-red-700">✕</button>
          </div>
        );
      })}
      <p className={`mb-1 ml-1 text-sm ${full ? "text-amber-700" : "text-slate-400"}`}>
        {full ? `Đã đủ ${TABBAR_MAX}. Bỏ bớt một cái nếu muốn thêm cái khác.` : `Còn ${TABBAR_MAX - keys.length} chỗ — bấm “＋” bên dưới để thêm.`}
      </p>

      <h2 className="mb-2 mt-5 ml-1 font-extrabold text-brand-dark">Thêm vào thanh</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {available.map((k) => {
          const { icon, label } = tabParts(ACTIONS[k].label);
          return (
            <button
              key={k}
              onClick={() => add(k)}
              disabled={full}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left disabled:opacity-40"
            >
              <span className="text-2xl leading-none">{icon}</span>
              <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{label}</span>
              <span className="text-xl font-extrabold text-brand">＋</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
