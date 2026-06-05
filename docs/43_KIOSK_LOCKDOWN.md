# 43 — Kiosk Lockdown (in-store touchscreen)

How to run the customer kiosk on an in-store touchscreen so shoppers **cannot leave the web app**
(no other tabs, no desktop).

## Principle (read first)
A browser tab **cannot stop a user from leaving to the OS** (Home button, edge gestures). Real
lockdown **must be enforced at the device/OS level**. The web app only complements it (fullscreen,
idle reset, no text-select/zoom). So: pick an OS lockdown method below **and** enable the web layer.

## Who does what (the shop owner is not technical)
- **Installer — once, at install time:** everything in this doc (OS lockdown app + launch URL +
  auto-restart). ~15–20 min. **Provision the device before delivery** so the owner just plugs it in
  and mounts it. Lock the kiosk app's own settings behind a **PIN** so neither a customer nor the
  owner can wander into them.
- **Owner — daily:** nothing technical. Configure the device to **self-recover**: Fully Kiosk
  "start on boot" + "auto-restart" + "return to start URL when idle" means a power cut → it comes
  back on its own. The only realistic owner action is *"if the screen freezes, unplug 10s and plug
  back in — it relaunches itself."* (Put that on a one-page card next to the screen.)
- **Customer:** just touches the screen. No exits, no settings.

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

**Enable it via the LAUNCH URL — not an in-page toggle.** Point the OS kiosk launcher (Fully Kiosk
start URL / Edge kiosk URL / Chromium `--kiosk`) at:

```text
http(s)://<server>/?kiosk=1
```

On first load the app persists `localStorage.cago_fixed_kiosk=1` (web hardening on, **only that
device** — customer phones are unaffected) and the flag survives later navigation. Use `?kiosk=0`
once to clear it. **Why the URL and not a checkbox:** a customer could reach an in-page checkbox and
untick it to bypass the lockdown; the launch URL is owned by the OS launcher and a locked-in shopper
can't reach the address bar, so it can't be flipped. For the same reason the `/map` toggle is shown
**only to a logged-in owner/staff** (setup convenience) — guests never see it.

Then the kiosk:
- **Idle reset:** after ~90s with no touch, the previous customer's cart + chat are cleared and it
  returns to the home screen (`useKioskLockdown`).
- **No context menu / text selection / drag / pinch-zoom** (`.kiosk-locked`); inputs stay editable.
- **⛶ Toàn màn hình** button (top-left) → one tap to go fullscreen (hides browser chrome).

Finally, serve over **HTTPS** ([38](38_GO_LIVE_RUNBOOK.md)) so camera/clipboard work and there's no "Not Secure" bar.

> Idle timeout lives in `web/src/lib/useKioskLockdown.ts` (`idleMs`, default 90s) — adjust if needed.

## One device, two roles: customer kiosk + staff POS

A small shop often has **one touchscreen** that should be a customer kiosk most of the time and the
staff POS when selling. Both are the **same web app on the same origin** (kiosk at `/`, POS at
`/pos`), so switching is just navigating **inside the already-locked browser** — no OS unlock, no
new tab. The security boundary is already there: every `/pos` route requires login
(`CapabilityGuard` → `/login`), so a customer who taps toward it can't sell.

**Quick PIN (so the owner doesn't retype the password all day):**
- Full **login once per shift**. On the kiosk device the POS home shows **🔒 Đặt mã PIN bán nhanh**
  (4 digits, stored hashed on the device).
- Hand the screen to a customer → **🧑‍🌾 Màn hình khách**: with a PIN it **locks** (session kept) and
  returns to the kiosk; without a PIN it logs out fully.
- Come back to sell → tap the discreet **🔑 Nhân viên · Bán hàng** link on the kiosk home → enter the
  PIN (`PinLock`) → POS, no password retype. Wrong-PIN shakes; "Đăng xuất" ends the shift.
- **Idle safety net:** on the kiosk device, POS left idle ~3 min auto-**locks** to the PIN (or logs
  out if no PIN) — so a forgotten session can't be used by the next customer
  (`usePosKioskAutoLock`).

> The PIN is a UI lock on an OS-locked in-shop device — the real boundary stays the OS lockdown +
> the login session. Files: `web/src/lib/posLock.ts`, `components/pos/{PinLock,SetPinDialog,Keypad}.tsx`.
