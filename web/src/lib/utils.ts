import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
