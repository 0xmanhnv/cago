"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kiosk help control: a single small round button tucked in a corner so it never covers product
 * info. Tap it to expand the labelled actions — "🤖 Hỏi trợ lý" + "🔔 Gọi người bán" — so older
 * customers still read the words, not just an icon. The whole widget is DRAGGABLE (like the old
 * assistant FAB): drag the round button to reposition (snaps to an edge, remembered per device);
 * a real tap (no drag) toggles open/close. Smooth scale/opacity transition on open/close.
 */
export function HelpFab({ onChat, onCall, showChat = true }: { onChat: () => void; onCall: () => void; showChat?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const KEY = "cago_fab_help";

  // Drag the whole widget (trigger + panel move together). A non-drag press = a tap → toggle.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const PAD = 12;
    const THRESH = 6;
    const clampSnap = (animate: boolean) => {
      const r = el.getBoundingClientRect();
      const w = el.offsetWidth || r.width;
      const x = r.left + w / 2 < window.innerWidth / 2 ? PAD : window.innerWidth - w - PAD;
      const y = Math.max(PAD, Math.min(r.top, window.innerHeight - (el.offsetHeight || r.height) - PAD));
      el.style.transition = animate ? "left .18s ease, top .18s ease" : "";
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
      if (animate) setTimeout(() => (el.style.transition = ""), 200);
      return { x, y };
    };
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || "null");
      if (p && typeof p.y === "number") {
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
        clampSnap(false);
      }
    } catch {
      /* ignore */
    }
    const onResize = () => clampSnap(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pointer handlers on the TRIGGER only: distinguish drag (move the widget) from tap (toggle).
  const drag = useRef({ sx: 0, sy: 0, ox: 0, oy: 0, moved: false });
  const onDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (!drag.current.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    drag.current.moved = true;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.transition = "";
    el.style.left = Math.max(0, Math.min(drag.current.ox + dx, window.innerWidth - w)) + "px";
    el.style.top = Math.max(0, Math.min(drag.current.oy + dy, window.innerHeight - h)) + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
  };
  const onUp = () => {
    const el = ref.current;
    if (!el) return;
    if (drag.current.moved) {
      // snap to nearest edge, keep Y, remember
      const r = el.getBoundingClientRect();
      const PAD = 12;
      const x = r.left + el.offsetWidth / 2 < window.innerWidth / 2 ? PAD : window.innerWidth - el.offsetWidth - PAD;
      const y = Math.max(PAD, Math.min(r.top, window.innerHeight - el.offsetHeight - PAD));
      el.style.transition = "left .18s ease, top .18s ease";
      el.style.left = x + "px";
      el.style.top = y + "px";
      setTimeout(() => (el.style.transition = ""), 200);
      try {
        localStorage.setItem(KEY, JSON.stringify({ x, y }));
      } catch {
        /* ignore */
      }
    } else {
      setOpen((v) => !v); // a real tap
    }
  };

  return (
    <div ref={ref} className="fixed bottom-24 right-3 z-[55] flex select-none flex-col items-end gap-2" style={{ touchAction: "none" }}>
      {/* actions — always mounted; animate in/out so open/close is smooth */}
      <div
        className={`flex flex-col items-end gap-2 transition-all duration-200 ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
      >
        {showChat && (
          <button onClick={() => { setOpen(false); onChat(); }} className="whitespace-nowrap rounded-full bg-violet-600 px-4 py-3 text-base font-extrabold text-white shadow-lg">
            🤖 Hỏi trợ lý
          </button>
        )}
        <button onClick={() => { setOpen(false); onCall(); }} className="whitespace-nowrap rounded-full bg-red-600 px-4 py-3 text-base font-extrabold text-white shadow-lg">
          🔔 Gọi người bán
        </button>
      </div>
      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        aria-label={open ? "Đóng trợ giúp" : "Cần trợ giúp"}
        className="grid h-14 w-14 place-items-center rounded-full bg-brand text-2xl text-white shadow-xl transition active:scale-95"
      >
        <span className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`}>{open ? "✕" : "💬"}</span>
      </button>
    </div>
  );
}
