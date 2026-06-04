# 43 — Kiosk Lockdown (in-store touchscreen)

How to run the customer kiosk on an in-store touchscreen so shoppers **cannot leave the web app**
(no other tabs, no desktop).

## Principle (read first)
A browser tab **cannot stop a user from leaving to the OS** (Home button, edge gestures). Real
lockdown **must be enforced at the device/OS level**. The web app only complements it (fullscreen,
idle reset, no text-select/zoom). So: pick an OS lockdown method below **and** enable the web layer.

## OS / device lockdown (pick one)

### A. Android touchscreen / tablet (cheapest, recommended for a rural shop)
- **Fully Kiosk Browser** (best for a web kiosk): install, set the start URL to the kiosk
  (`http(s)://<server>/`), then lock the status bar, Home/Back, edge swipes and multitasking; enable
  auto-restart and "return to start URL when idle". Robust + remote admin.
- Or built-in **Screen Pinning** (Settings → Security → Screen pinning): simpler, weaker.
- For full control, provision the device in **Android Enterprise device-owner / kiosk** mode.

### B. Windows mini-PC / all-in-one touchscreen
- **Assigned Access (Kiosk mode)** — Windows Pro: create a dedicated kiosk account that runs a single
  app, **Microsoft Edge in kiosk mode** pointed at the kiosk URL. The user can't reach the desktop or other apps.
  (Settings → Accounts → Other users → Set up a kiosk.)

### C. Linux mini-PC / Raspberry Pi (most control, cheap, reliable)
- Auto-login a minimal session that launches **Chromium in kiosk mode** under a tiny window manager
  (e.g. openbox), with no desktop environment to escape to:
  ```bash
  chromium --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 \
           --no-first-run --incognito 'http://<server>:8080/'
  ```
  Disable keyboard shortcuts / hide the cursor (`unclutter`), and auto-restart on exit.

### Hardware suggestion (when undecided)
For a rural shop, an **Android touchscreen/tablet + Fully Kiosk Browser** is the best balance:
cheapest, easiest to lock, battery + touch built in, no PC maintenance. Pick a 10–15" model. Choose
a **Windows/Linux mini-PC** only if the same screen must also do other PC tasks.

## Web layer (already built — enable it)
1. On the kiosk device, open `/map` and tick **"Đây là màn hình kiosk cố định đặt tại quầy"** (sets
   `localStorage.cago_fixed_kiosk=1`). This turns on the web hardening **only on that device**
   (customer phones are unaffected).
2. Then the kiosk:
   - **Idle reset:** after ~90s with no touch, the previous customer's cart + chat are cleared and it
     returns to the home screen (`useKioskLockdown`).
   - **No context menu / text selection / drag / pinch-zoom** (`.kiosk-locked`); inputs stay editable.
   - **⛶ Toàn màn hình** button (top-left) → one tap to go fullscreen (hides browser chrome).
3. Serve over **HTTPS** ([38](38_GO_LIVE_RUNBOOK.md)) so camera/clipboard work and there's no "Not Secure" bar.

> Idle timeout lives in `web/src/lib/useKioskLockdown.ts` (`idleMs`, default 90s) — adjust if needed.
