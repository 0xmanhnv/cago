// Visual + text helpers shared across the kiosk UI.
// NOTE: category icon/colour are DATA from the server (Item Group, owner-editable) —
// never keyword-matched here. These are only neutral fallbacks when the server hasn't
// provided one.

export const DEFAULT_CATEGORY_ICON = "📦";
export const DEFAULT_CATEGORY_COLOR = "#e6f4ea";

export function catIcon(icon?: string | null) {
  return icon || DEFAULT_CATEGORY_ICON;
}
export function catColor(color?: string | null) {
  return color || DEFAULT_CATEGORY_COLOR;
}

// Vietnamese mobile validation/normalization (10-digit 0xx, or +84/84 forms).
export function normalizePhone(p: string) {
  let s = (p || "").replace(/[\s.\-()]/g, "");
  if (s.indexOf("+84") === 0) s = "0" + s.slice(3);
  else if (s.indexOf("84") === 0 && s.length === 11) s = "0" + s.slice(2);
  return s;
}
export function validPhone(p: string) {
  return /^0(3|5|7|8|9)\d{8}$/.test(normalizePhone(p));
}

function escapeHtml(s: string) {
  return (s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

// Safe light-markdown: escape first (anti-XSS), then **bold** + tidy bullets.
export function mdLight(s: string) {
  let h = escapeHtml(s || "");
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  h = h.replace(/__(.+?)__/g, "<b>$1</b>");
  h = h.replace(/(^|\n)\s*[-*•]\s+/g, "$1• ");
  return h;
}

export function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* no TTS available */
  }
}

export const EXPIRY_LABEL: Record<string, { text: string; cls: string }> = {
  near: { text: "Sắp hết hạn", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  expired: { text: "Đã hết hạn", cls: "bg-red-100 text-red-700 border-red-300" },
  ok: { text: "", cls: "" },
};
