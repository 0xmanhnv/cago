import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Copy text to the clipboard, robustly. navigator.clipboard only works on HTTPS/localhost — on a
 * plain http LAN IP (the shop's setup) it's undefined, so fall back to a hidden-textarea +
 * execCommand("copy"). Returns whether it succeeded so the UI can give honest feedback.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// --- Money (VND) -----------------------------------------------------------
// đồng has no sub-unit: always round, group with vi-VN dots, no decimals.
// Use ONE formatter everywhere so owner/staff/kiosk render identically.
export function formatVnd(n: number): string {
  return `${Math.round(n || 0).toLocaleString("vi-VN")}đ`;
}

// Parse a money field the user typed. Strips everything but digits so VN-grouped
// input ("1.000.000") and stray "đ"/spaces round-trip to the integer 1000000 —
// never misread a grouping dot as a decimal point (the parseFloat("1.000")=1 bug).
export function parseVnd(s: string | number | null | undefined): number {
  if (typeof s === "number") return Math.round(s) || 0;
  return parseInt((s || "").replace(/[^\d]/g, ""), 10) || 0;
}

// Live thousands-grouping for a money <input> as the user types: "10000" → "10.000".
export function groupVnd(s: string): string {
  const d = (s || "").replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("vi-VN") : "";
}
