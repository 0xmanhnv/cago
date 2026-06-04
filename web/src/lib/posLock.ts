"use client";

/**
 * Quick PIN lock for a shared kiosk device that is BOTH the customer kiosk and the staff POS.
 * Full login happens once per shift; after that a 4-digit PIN locks/unlocks the POS so the owner
 * doesn't retype the password on every hand-over. This is a UI lock on an OS-locked in-shop device
 * (the real boundary is the OS kiosk lockdown + the login session) — the PIN hash is device-local,
 * so it gates the screen, not the server. No-op on personal phones (only when isFixedKiosk()).
 */
const PIN_KEY = "cago_pos_pin"; // SHA-256 hex of the 4-digit PIN (device-local)
const LOCK_KEY = "cago_pos_locked"; // "1" while the POS is locked behind the PIN

export function hasPosPin(): boolean {
  return typeof window !== "undefined" && !!window.localStorage?.getItem(PIN_KEY);
}

export async function setPosPin(pin: string): Promise<void> {
  window.localStorage?.setItem(PIN_KEY, await sha256(pin));
}

export function clearPosPin(): void {
  if (typeof window === "undefined") return;
  window.localStorage?.removeItem(PIN_KEY);
  window.localStorage?.removeItem(LOCK_KEY);
}

export async function verifyPosPin(pin: string): Promise<boolean> {
  const h = typeof window !== "undefined" ? window.localStorage?.getItem(PIN_KEY) : null;
  return !!h && h === (await sha256(pin));
}

export function isPosLocked(): boolean {
  return typeof window !== "undefined" && window.localStorage?.getItem(LOCK_KEY) === "1";
}

export function setPosLocked(v: boolean): void {
  if (typeof window === "undefined") return;
  if (v) window.localStorage?.setItem(LOCK_KEY, "1");
  else window.localStorage?.removeItem(LOCK_KEY);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("cago:" + s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
