"use client";

import { useEffect, useRef, useState } from "react";

/**
 * App-wide confirm/alert dialog — a styled replacement for the browser's native
 * window.confirm()/alert(). Call confirmDialog()/alertDialog() from anywhere (no props,
 * no context needed); <DialogHost/> is mounted once in Providers and renders the modal.
 * Requests queue so back-to-back calls don't clobber each other.
 */
type DialogReq = {
  id: number;
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  alert?: boolean;
  resolve: (v: boolean) => void;
};

let emit: ((r: DialogReq) => void) | null = null;
let seq = 0;

function request(message: string, opts: Partial<DialogReq>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req: DialogReq = { id: ++seq, message, resolve, ...opts };
    if (emit) emit(req);
    // Fallback before the host mounts (very early calls): native dialog, never silently swallow.
    else resolve(opts.alert ? true : (typeof window !== "undefined" ? window.confirm(message) : false));
  });
}

export const confirmDialog = (message: string, opts?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) =>
  request(message, opts || {});

export const alertDialog = (message: string, opts?: { title?: string; danger?: boolean }) =>
  request(message, { ...(opts || {}), alert: true }).then(() => undefined);

export function DialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const [closing, setClosing] = useState(false); // play the exit animation before unmounting
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    emit = (r) => setQueue((q) => [...q, r]);
    return () => {
      emit = null;
    };
  }, []);

  const cur = queue[0];
  const close = (v: boolean) => {
    if (closing || !cur) return;
    cur.resolve(v);
    setClosing(true);
    // Let the fade/scale-out finish, then advance the queue (matches pop-out/fade-out ~0.16s).
    setTimeout(() => {
      setClosing(false);
      setQueue((q) => q.slice(1));
    }, 170);
  };

  // Keyboard: autofocus the primary action; ESC cancels (alert → dismiss), Enter confirms.
  // (Owner may use a keyboard; AT users need ESC.) Keyed on the current request id.
  useEffect(() => {
    if (!cur) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(cur.alert ? true : false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  if (!cur) return null;
  const titleId = `dlg-title-${cur.id}`;
  const msgId = `dlg-msg-${cur.id}`;
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5 ${closing ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={() => close(cur.alert ? true : false)}
    >
      <div
        role={cur.alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={cur.title ? titleId : msgId}
        aria-describedby={msgId}
        className={`w-full max-w-[400px] rounded-2xl bg-white p-5 shadow-xl ${closing ? "animate-pop-out" : "animate-pop-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {cur.title && <div id={titleId} className="mb-1 text-xl font-extrabold text-slate-800">{cur.title}</div>}
        <div id={msgId} className="whitespace-pre-line text-lg font-bold text-slate-800">{cur.message}</div>
        <div className="mt-4 flex gap-2">
          {!cur.alert && (
            <button onClick={() => close(false)} className="min-h-touch flex-1 rounded-xl bg-slate-200 py-3 text-lg font-bold text-slate-700">
              {cur.cancelLabel || "Huỷ"}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            className={`min-h-touch rounded-xl py-3 text-lg font-extrabold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand/40 ${cur.alert ? "w-full" : "flex-[2]"} ${cur.danger ? "bg-red-600" : "bg-brand"}`}
          >
            {cur.confirmLabel || (cur.alert ? "OK" : "Đồng ý")}
          </button>
        </div>
      </div>
    </div>
  );
}
