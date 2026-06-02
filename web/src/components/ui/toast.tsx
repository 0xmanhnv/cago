"use client";

import { useEffect, useState } from "react";

/**
 * App-wide toast notifications — iPhone-style, slide down from the top, auto-dismiss, stack, and
 * never shift the page (overlay). Call toast.success()/error()/info() from anywhere; <ToastHost/>
 * is mounted once in Providers. Replaces the old inline Ok/Warn banners for transient notices.
 */
type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  leaving?: boolean;
}

let emit: ((t: ToastItem) => void) | null = null;
let seq = 0;

function push(message: string, type: ToastType) {
  const item: ToastItem = { id: ++seq, message, type };
  emit?.(item);
}

export const toast = {
  success: (m: string) => push(m, "success"),
  error: (m: string) => push(m, "error"),
  info: (m: string) => push(m, "info"),
};

const STYLE: Record<ToastType, { ring: string; icon: string }> = {
  success: { ring: "border-l-emerald-500", icon: "✅" },
  error: { ring: "border-l-red-500", icon: "⚠️" },
  info: { ring: "border-l-brand", icon: "ℹ️" },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Mark leaving (play fade-out) then remove — so dismissal is smooth, not an instant pop.
  const dismiss = (id: number) => {
    setItems((q) => q.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setItems((q) => q.filter((x) => x.id !== id)), 200);
  };
  useEffect(() => {
    emit = (t) => {
      setItems((q) => [...q.slice(-3), t]); // keep at most 4 on screen
      const ms = t.type === "error" ? 4500 : 2800;
      setTimeout(() => dismiss(t.id), ms);
    };
    return () => {
      emit = null;
    };
  }, []);

  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[110] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          role="status"
          className={`pointer-events-auto flex w-full max-w-[440px] items-start gap-2.5 rounded-2xl border border-slate-100 border-l-4 ${STYLE[t.type].ring} bg-white px-4 py-3 text-left font-semibold text-slate-800 shadow-card ${t.leaving ? "animate-fade-out" : "animate-toast-in"}`}
        >
          <span className="text-lg leading-none">{STYLE[t.type].icon}</span>
          <span className="min-w-0 flex-1">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
