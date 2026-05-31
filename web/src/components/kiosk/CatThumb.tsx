"use client";

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
  variant: "grid" | "big";
}) {
  const h = variant === "big" ? "h-64" : "h-[150px]";
  if (image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} className={`w-full ${h} object-cover`} />;
  return (
    <div className={`flex w-full ${h} flex-col items-center justify-center`} style={{ background: catColor(color) }}>
      <span className={variant === "big" ? "text-7xl" : "text-5xl"}>{catIcon(icon)}</span>
    </div>
  );
}
