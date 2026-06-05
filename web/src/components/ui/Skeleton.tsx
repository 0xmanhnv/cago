// Loading placeholders. A shimmering skeleton reads as "đang tải, máy vẫn chạy" — much better than a
// blank screen + tiny "Đang tải..." (which a non-tech user reads as "hỏng") on a slow rural connection.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

/** A list of placeholder cards mimicking a typical row (thumb + 2 text lines + a right value). */
export function SkeletonRows({ rows = 5, thumb = true }: { rows?: number; thumb?: boolean }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-sm">
          {thumb && <Skeleton className="h-10 w-10 shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3 bg-slate-200/60" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
