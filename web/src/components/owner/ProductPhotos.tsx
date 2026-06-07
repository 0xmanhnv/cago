"use client";

/**
 * Shared product-photo editor used by both the create form (NewProduct) and the full editor
 * (ProductEditor). It is purely presentational — the parent owns the data and the actions, so the
 * same layout serves local picked files (not yet uploaded) and server-stored images alike:
 *   - big preview of the main photo (or a "no photo yet" hint),
 *   - one full-width "📷 Tải ảnh lên" button,
 *   - a row per photo with ★ Ảnh chính / Đặt ảnh chính + Xoá.
 */
export type Photo = { url: string; main: boolean };

export function ProductPhotos({
  photos,
  onPick,
  onSetMain,
  onRemove,
}: {
  photos: Photo[];
  onPick: (files: FileList | null) => void;
  onSetMain: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const main = photos.find((p) => p.main) || photos[0];
  return (
    <>
      {main ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={main.url} alt="" className="max-h-56 w-full rounded-lg bg-slate-100 object-contain" />
      ) : (
        <div className="rounded-lg bg-slate-100 p-5 text-center text-slate-500">Chưa có ảnh — bấm &quot;Tải ảnh lên&quot;</div>
      )}
      <label className="mt-2 flex min-h-touch cursor-pointer items-center justify-center rounded-xl bg-brand font-extrabold text-white">
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
        📷 Tải ảnh lên
      </label>
      {photos.map((p) => (
        <div key={p.url} className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
          <div className="flex-1">
            {p.main ? (
              <b className="text-brand">★ Ảnh chính</b>
            ) : (
              <button onClick={() => onSetMain(p.url)} className="rounded bg-slate-200 px-2 py-1 text-sm font-bold">Đặt ảnh chính</button>
            )}
          </div>
          <button onClick={() => onRemove(p.url)} className="rounded bg-red-100 px-2 py-1 text-sm font-bold text-red-700">Xoá</button>
        </div>
      ))}
    </>
  );
}
