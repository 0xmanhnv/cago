"use client";

import * as Dialog from "@radix-ui/react-dialog";

/**
 * Shared modal/bottom-sheet built on Radix Dialog (already a dependency). Headless → keeps the
 * bespoke "Minh Tuyết" look (our own classes + sheet-up/pop-in animations) while getting focus-trap,
 * background scroll-lock, ESC-to-close and focus-restore for free — the gaps the hand-rolled overlays
 * had. `variant="bottom"` = phone bottom-sheet (centered card on ≥sm); "center" = centered card.
 *
 * onOpenAutoFocus is prevented so opening a sheet on touch doesn't pop the soft keyboard
 * (see memory: autoFocus on fixed overlays).
 */
export function Sheet({
  open,
  onClose,
  children,
  variant = "center",
  label = "Hộp thoại",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "center" | "bottom";
  label?: string;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] animate-fade-in bg-black/45" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={
            // NOTE: centering uses a transform (-translate-x/y-1/2), so the entrance animation must
            // NOT also animate transform or it clobbers the centering (panel drifts off-screen).
            // center → fade-in (opacity only); bottom → sheet-up but stays bottom-anchored (no translate).
            (variant === "bottom"
              ? "fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[88vh] w-full max-w-[480px] animate-sheet-up overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
              : "fixed left-1/2 top-1/2 z-[81] max-h-[88vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-fade-in overflow-auto rounded-2xl bg-white p-5") +
            (className ? ` ${className}` : "")
          }
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
