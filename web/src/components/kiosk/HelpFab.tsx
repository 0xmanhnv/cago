"use client";

import { useState } from "react";

/**
 * Collapsed help control for the kiosk: a single small round button in the corner so it never
 * covers product info. Tapping (or hovering on desktop) expands it into the labelled actions —
 * "🤖 Hỏi trợ lý" + "🔔 Gọi người bán" — so older customers still see the WORDS, not just an icon.
 * Like iOS Picture-in-Picture: tucked away until you touch it.
 */
export function HelpFab({ onChat, onCall, showChat = true }: { onChat: () => void; onCall: () => void; showChat?: boolean }) {
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <>
      {/* tap outside to collapse (transparent; only when open) */}
      {open && <button aria-label="Đóng" className="fixed inset-0 z-[54] cursor-default bg-transparent" onClick={() => setOpen(false)} />}
      <div
        className="fixed bottom-24 right-3 z-[55] flex flex-col items-end gap-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {open && (
          <div className="flex flex-col items-end gap-2">
            {showChat && (
              <button onClick={act(onChat)} className="animate-pop-in whitespace-nowrap rounded-full bg-violet-600 px-4 py-3 text-base font-extrabold text-white shadow-lg">
                🤖 Hỏi trợ lý
              </button>
            )}
            <button onClick={act(onCall)} className="animate-pop-in whitespace-nowrap rounded-full bg-red-600 px-4 py-3 text-base font-extrabold text-white shadow-lg">
              🔔 Gọi người bán
            </button>
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Đóng trợ giúp" : "Cần trợ giúp"}
          className="grid h-14 w-14 place-items-center rounded-full bg-brand text-2xl text-white shadow-xl transition active:scale-95"
        >
          {open ? "✕" : "💬"}
        </button>
      </div>
    </>
  );
}
