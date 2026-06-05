"use client";

import { useEffect, useRef, useState } from "react";

/**
 * App-wide toast notifications — iPhone-style banners that slide down from the top, auto-dismiss,
 * stack, and never shift the page (overlay). Swipe a banner up (or tap it) to dismiss early. The
 * surface is a frosted "liquid glass" material (translucent + blur), kept fairly opaque so text
 * stays legible for older users. Call toast.success()/error()/info() from anywhere; <ToastHost/>
 * is mounted once in Providers.
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

// One banner. Owns its swipe-to-dismiss drag (upward only) so cards dismiss independently.
function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [dy, setDy] = useState(0);
  const drag = useRef({ y: 0, active: false, moved: false });

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, active: true, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const d = e.clientY - drag.current.y;
    if (Math.abs(d) > 4) drag.current.moved = true;
    setDy(Math.min(0, d)); // only allow dragging upward
  };
  const onUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (dy < -36) onDismiss(item.id); // swiped up far enough → dismiss
    else setDy(0); // not far enough → snap back
  };

  return (
    <div
      role="status"
      onClick={() => { if (!drag.current.moved) onDismiss(item.id); }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        transform: dy ? `translateY(${dy}px)` : undefined,
        opacity: dy ? Math.max(0, 1 + dy / 120) : undefined,
        transition: drag.current.active ? "none" : "transform .2s ease, opacity .2s ease",
        touchAction: "none",
      }}
      className={`pointer-events-auto flex w-full max-w-[440px] cursor-pointer select-none items-start gap-2.5 rounded-2xl border border-white/40 border-l-4 ${STYLE[item.type].ring} bg-white/[0.78] px-4 py-3 text-left font-semibold text-slate-800 shadow-card ring-1 ring-white/50 backdrop-blur-xl backdrop-saturate-150 ${item.leaving ? "animate-fade-out" : "animate-toast-in"}`}
    >
      <span className="text-lg leading-none">{STYLE[item.type].icon}</span>
      <span className="min-w-0 flex-1">{item.message}</span>
    </div>
  );
}

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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[110] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end sm:pt-0">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
