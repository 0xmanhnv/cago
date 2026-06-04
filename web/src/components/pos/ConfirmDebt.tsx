"use client";

import { useEffect, useRef, useState } from "react";

export interface DebtProof {
  signature?: string; // PNG data URL of the finger signature / điểm chỉ
  photo?: string; // JPEG/PNG data URL of a captured photo
  witness?: string;
}
interface Policy {
  mode: "off" | "optional" | "required";
  min: number;
}

/**
 * "Khách xác nhận nợ" — the digital replacement for signing the paper debt ledger. Captures a finger
 * signature / điểm chỉ, an optional photo, and an optional witness name. Whether it's REQUIRED is
 * driven by the owner's policy + a money threshold; below the threshold (or mode=optional) the
 * customer can skip. Returns the proof on confirm, or null on a permitted skip; onCancel aborts.
 */
export function ConfirmDebt({
  amount,
  kind,
  customerName,
  policy,
  onDone,
  onCancel,
}: {
  amount: number;
  kind: "debt" | "repay";
  customerName?: string;
  policy: Policy;
  onDone: (proof: DebtProof | null) => void;
  onCancel: () => void;
}) {
  const required = policy.mode === "required" && amount >= (policy.min || 0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);
  const [photo, setPhoto] = useState<string>("");
  const [witness, setWitness] = useState("");
  const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Size the backing store to the displayed size for crisp strokes on hi-dpi.
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0f172a";
    }
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasSig) setHasSig(true);
  };
  const end = () => {
    drawing.current = false;
  };
  const clearSig = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasSig(false);
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(f);
  };

  const captured = hasSig || !!photo || !!witness.trim();
  const confirm = () => {
    if (required && !captured) return;
    onDone({
      signature: hasSig ? canvasRef.current!.toDataURL("image/png") : "",
      photo,
      witness: witness.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="max-h-[92vh] w-full max-w-md overflow-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="text-3xl">✍️</div>
          <div className="mt-1 text-lg font-extrabold text-brand-dark">
            Khách xác nhận {kind === "repay" ? "đã trả" : "ghi nợ"}
          </div>
          <div className="text-sm text-slate-500">
            {customerName ? `${customerName} · ` : ""}<b className="text-brand">{vnd(amount)}</b>
            {required ? " · bắt buộc xác nhận" : " · có thể bỏ qua"}
          </div>
        </div>

        <label className="mt-3 block text-sm font-bold text-slate-600">Khách ký / điểm chỉ vào ô dưới</label>
        <div className="mt-1 rounded-2xl border-2 border-emerald-300 bg-slate-50">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="h-40 w-full touch-none rounded-2xl"
          />
        </div>
        <div className="mt-1 flex justify-end">
          <button onClick={clearSig} className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-bold text-slate-500">↺ Xoá ký lại</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-100 font-bold text-slate-700">
            📷 {photo ? "Chụp lại" : "Chụp ảnh"}
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
          </label>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Ảnh xác nhận" className="h-[56px] w-full rounded-xl object-cover" />
          ) : (
            <div className="flex min-h-[56px] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400">chưa có ảnh</div>
          )}
        </div>

        <label className="mt-3 block text-sm font-bold text-slate-600">👤 Người làm chứng (không bắt buộc)</label>
        <input
          value={witness}
          onChange={(e) => setWitness(e.target.value)}
          placeholder="VD: anh Tư hàng xóm"
          className="mt-1 w-full rounded-lg border-2 border-emerald-200 p-2.5"
        />

        <div className="mt-4 flex gap-2">
          <button
            onClick={confirm}
            disabled={required && !captured}
            className="flex-1 rounded-xl bg-brand py-3 font-extrabold text-white disabled:opacity-50"
          >
            ✓ Xác nhận
          </button>
          {!required && (
            <button onClick={() => onDone(null)} className="rounded-xl bg-slate-200 px-4 font-bold text-slate-600">Bỏ qua</button>
          )}
          <button onClick={onCancel} className="rounded-xl bg-slate-100 px-4 font-bold text-slate-500">Huỷ</button>
        </div>
        {required && !captured && (
          <div className="mt-2 text-center text-xs text-amber-600">Khoản này cần khách ký, chụp ảnh hoặc ghi người làm chứng.</div>
        )}
      </div>
    </div>
  );
}
