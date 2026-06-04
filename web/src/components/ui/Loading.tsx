// Shared loading visuals so every screen feels the same: a branded spinner + a delayed fade-in so
// the loader never *flashes* for fast loads (it only appears if the wait passes ~200ms), and content
// eases in instead of snapping. Pairs with Skeleton/SkeletonRows for list-shaped screens.

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-[3px] border-emerald-200 border-t-brand ${className || "h-8 w-8"}`}
      role="status"
      aria-label="Đang tải"
    />
  );
}

/** Full-area loader for a page/section gate. Delayed fade-in → no flash on quick loads. */
export function PageLoading({ label = "Đang tải...", className = "" }: { label?: string; className?: string }) {
  return (
    <div
      className={`flex min-h-[40vh] flex-col items-center justify-center gap-3 animate-fade-in [animation-delay:200ms] ${className}`}
    >
      <Spinner />
      {label && <div className="text-sm font-semibold text-slate-400">{label}</div>}
    </div>
  );
}
