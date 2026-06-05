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

let _pushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Push the current state to the customer display. Same-machine 2nd window updates instantly via
 * BroadcastChannel; a SEPARATE device gets it by polling the server, so we also relay the state to
 * the server (debounced). The customer name is stripped from the server copy (privacy on a public,
 * guest-readable endpoint) — it stays only in the local BroadcastChannel/localStorage copy.
 */
export function cfdPost(msg: CfdMsg) {
  try {
    channel()?.postMessage(msg);
    window.localStorage?.setItem(CFD_LAST, JSON.stringify(msg));
  } catch {
    /* ignore */
  }
  // Relay to the server for cross-device displays (fire-and-forget, debounced, dynamic import to
  // avoid a hard dependency from non-till code).
  clearTimeout(_pushTimer);
  const serverMsg = msg.type === "cart" ? { ...msg, customer_name: undefined } : msg;
  _pushTimer = setTimeout(() => {
    import("@/lib/api")
      .then(({ frappeCall }) => frappeCall("cago.api.display.set_state", { data: JSON.stringify(serverMsg) }))
      .catch(() => {});
  }, 350);
}

export function cfdLast(): CfdMsg | null {
  try {
    const raw = window.localStorage?.getItem(CFD_LAST);
    return raw ? (JSON.parse(raw) as CfdMsg) : null;
  } catch {
    return null;
  }
}
