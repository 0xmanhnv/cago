"use client";

/**
 * Quick PIN lock for a shared kiosk device that is BOTH the customer kiosk and the staff POS.
 * Full login happens once per shift; after that a 4-digit PIN locks/unlocks the POS so the owner
 * doesn't retype the password on every hand-over. This is a UI lock on an OS-locked in-shop device
 * (the real boundary is the OS kiosk lockdown + the login session) — the PIN digest is device-local,
 * so it gates the screen, not the server. No-op on personal phones (only when isFixedKiosk()).
 */
const PIN_KEY = "cago_pos_pin"; // device-local digest of the 4-digit PIN
const LOCK_KEY = "cago_pos_locked"; // "1" while the POS is locked behind the PIN

export function hasPosPin(): boolean {
  return typeof window !== "undefined" && !!window.localStorage?.getItem(PIN_KEY);
}

export function setPosPin(pin: string): void {
  window.localStorage?.setItem(PIN_KEY, digest(pin));
}

export function clearPosPin(): void {
  if (typeof window === "undefined") return;
  window.localStorage?.removeItem(PIN_KEY);
  window.localStorage?.removeItem(LOCK_KEY);
}

export function verifyPosPin(pin: string): boolean {
  const h = typeof window !== "undefined" ? window.localStorage?.getItem(PIN_KEY) : null;
  return !!h && h === digest(pin);
}

export function isPosLocked(): boolean {
  return typeof window !== "undefined" && window.localStorage?.getItem(LOCK_KEY) === "1";
}

export function setPosLocked(v: boolean): void {
  if (typeof window === "undefined") return;
  if (v) window.localStorage?.setItem(LOCK_KEY, "1");
  else window.localStorage?.removeItem(LOCK_KEY);
}

// Synchronous, non-cryptographic digest (FNV-1a 32-bit ×2). Deliberately NOT crypto.subtle, which
// only exists in a secure context (HTTPS/localhost) and would throw over plain HTTP — see the bug
// where the PIN dialog froze on an IP/HTTP kiosk. Good enough: the PIN is a device-local UI gate,
// not server auth, but we still avoid storing it in clear.
function digest(pin: string): string {
  const a = fnv(pin, 0x811c9dc5);
  const b = fnv("salt:" + pin, 0x01000193);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function fnv(s: string, seed: number): number {
  let h = seed;
  const str = "cago:" + s;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h;
}
