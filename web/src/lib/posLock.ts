"use client";

import { frappeCall } from "./api";

/**
 * Quick PIN lock for a shared kiosk+POS device. The lock state + PIN live on the SERVER (session
 * flag + hashed PIN on the User), NOT in localStorage — so a customer can't bypass it by editing
 * the URL, reloading, or clearing storage. The frontend reads `boot.pos_locked` / `boot.has_pos_pin`
 * from the session bootstrap and calls these to change it (reload the bootstrap afterwards). This is
 * defence-in-depth on top of the OS-level kiosk lockdown, which remains the real boundary.
 */
export async function setPosPin(pin: string): Promise<void> {
  await frappeCall("cago.api.session.set_pos_pin", { pin });
}

export async function clearPosPin(): Promise<void> {
  await frappeCall("cago.api.session.clear_pos_pin", {});
}

/** Lock the POS on this device (server-session flag). */
export async function lockPos(): Promise<void> {
  await frappeCall("cago.api.session.pos_lock", {});
}

/** Verify the PIN server-side and clear the lock. Throws (wrong PIN / rate-limited) on failure. */
export async function unlockPos(pin: string): Promise<void> {
  await frappeCall("cago.api.session.pos_unlock", { pin });
}
