"use client";

import { useEffect, useRef } from "react";

/**
 * A fixed button that the user can drag anywhere (so it never permanently hides
 * content). Position persists per-device in localStorage. A real tap still fires
 * onTap; only an actual drag suppresses the click.
 */
export function FloatingFab({
  storageKey,
  onTap,
  className,
  style,
  children,
  title,
}: {
  storageKey: string;
  onTap: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  title?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const PAD = 6;
    const THRESH = 6;
    const clampApply = (x: number, y: number) => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const cx = Math.max(PAD, Math.min(x, window.innerWidth - w - PAD));
      const cy = Math.max(PAD, Math.min(y, window.innerHeight - h - PAD));
      el.style.left = cx + "px";
      el.style.top = cy + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    };
    // Dock the button to the nearest vertical edge (left/right), keeping its Y. Used on load and
    // on release so the FAB only ever lives on an edge instead of floating over the content.
    const snapToEdge = (animate = false) => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = el.getBoundingClientRect();
      const x = r.left + w / 2 < window.innerWidth / 2 ? PAD : window.innerWidth - w - PAD;
      const y = Math.max(PAD, Math.min(r.top, window.innerHeight - h - PAD));
      if (animate) {
        el.style.transition = "left .18s ease, top .18s ease";
        window.setTimeout(() => (el.style.transition = ""), 220);
      }
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
      return { x, y };
    };

    try {
      const p = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (p && typeof p.x === "number") {
        clampApply(p.x, p.y);
        snapToEdge(); // older free-floating saves (or a resized window) snap back to an edge
      }
    } catch {
      /* ignore */
    }

    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let moved = false;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < THRESH) return;
      moved = true;
      el.classList.add("opacity-90");
      clampApply(ox + dx, oy + dy);
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.classList.remove("opacity-90");
      if (moved) {
        const pos = snapToEdge(true); // dock to the nearest left/right edge, keep Y
        try {
          localStorage.setItem(storageKey, JSON.stringify(pos));
        } catch {
          /* ignore */
        }
      }
      (el as HTMLButtonElement & { _moved?: boolean })._moved = moved;
    };
    const onDown = (e: PointerEvent) => {
      moved = false;
      (el as HTMLButtonElement & { _moved?: boolean })._moved = false; // clear stale flag (e.g. after pointercancel)
      const r = el.getBoundingClientRect();
      sx = e.clientX;
      sy = e.clientY;
      ox = r.left;
      oy = r.top;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    };
    const onClick = (e: MouseEvent) => {
      const m = (el as HTMLButtonElement & { _moved?: boolean })._moved;
      if (m) {
        e.preventDefault();
        e.stopPropagation();
        (el as HTMLButtonElement & { _moved?: boolean })._moved = false;
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick, true);
    };
  }, [storageKey]);

  return (
    <button
      ref={ref}
      onClick={onTap}
      title={title}
      style={{ touchAction: "none", userSelect: "none", ...style }}
      className={className}
    >
      {children}
    </button>
  );
}
