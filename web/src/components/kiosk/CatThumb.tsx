"use client";

import { useState } from "react";
import { catColor, catIcon } from "@/lib/kioskUi";

export function CatThumb({
  image,
  icon,
  color,
  name,
  variant,
}: {
  image?: string | null;
  icon?: string;
  color?: string;
  name: string;
  variant: "grid" | "big" | "thumb";
}) {
  const [broken, setBroken] = useState(false);
  const h = variant === "big" ? "h-64" : variant === "thumb" ? "h-full" : "h-[150px]";
  if (image && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} onError={() => setBroken(true)} className={`w-full ${h} object-cover`} />;
  // No photo yet → a clean, branded placeholder (category tint gradient + icon in a soft disc)
  // instead of a blank/odd image; looks intentional until the owner uploads a real photo.
  const tint = catColor(color);
  return (
    <div
      className={`flex w-full ${h} items-center justify-center`}
      style={{ background: `linear-gradient(160deg, ${tint} 0%, #ffffff 140%)` }}
    >
      <span
        className={`flex items-center justify-center rounded-full bg-white/70 shadow-sm ${
          variant === "big" ? "h-28 w-28 text-6xl" : variant === "thumb" ? "h-11 w-11 text-2xl" : "h-20 w-20 text-4xl"
        }`}
      >
        {catIcon(icon)}
      </span>
    </div>
  );
}
