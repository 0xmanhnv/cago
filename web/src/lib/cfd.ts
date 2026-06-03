// Customer-facing display (màn hình phụ cho khách). The sell screen broadcasts the live cart/total/QR
// to a second window opened at /pos/display on the customer-facing screen. Uses BroadcastChannel
// (same browser, 2 windows/screens — the cheap CFD setup), mirrored to localStorage so the display
// shows the latest state the moment it opens and as a fallback where BroadcastChannel is missing.

export const CFD_CHANNEL = "cago-cfd";
export const CFD_LAST = "cago_cfd_last";

export interface CfdLine {
  name: string;
  qty: number;
  amount_text: string;
}
export type CfdMsg =
  | { type: "cart"; lines: CfdLine[]; total_text: string; saved_text?: string; customer_name?: string }
  | { type: "qr"; url: string; amount_text: string }
  | { type: "done"; total_text: string }
  | { type: "idle" };

let _ch: BroadcastChannel | null = null;
function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  if (!_ch) _ch = new BroadcastChannel(CFD_CHANNEL);
  return _ch;
}

/** Push the current state to the customer display (no-op if not in a browser). */
export function cfdPost(msg: CfdMsg) {
  try {
    channel()?.postMessage(msg);
    window.localStorage?.setItem(CFD_LAST, JSON.stringify(msg)); // also drives the `storage` fallback + initial paint
  } catch {
    /* ignore */
  }
}

export function cfdLast(): CfdMsg | null {
  try {
    const raw = window.localStorage?.getItem(CFD_LAST);
    return raw ? (JSON.parse(raw) as CfdMsg) : null;
  } catch {
    return null;
  }
}
