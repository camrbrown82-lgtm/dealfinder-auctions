"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { lotImages } from "@/lib/catalog";
import type { Lot } from "@/lib/types";

function isRemote(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

export function LotGallery({
  images,
  alt,
  variant = "card",
  sizes,
}: {
  images: string[];
  alt: string;
  variant?: "card" | "hero" | "compact";
  sizes?: string;
}) {
  const photos = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  const current = photos[index] ?? "";
  const many = photos.length > 1;

  useEffect(() => {
    if (variant !== "hero" || !many) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => (value - 1 + photos.length) % photos.length);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((value) => (value + 1) % photos.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [many, photos.length, variant]);

  const compact = variant === "compact";
  const height = variant === "hero" ? "aspect-square" : compact ? "h-24 sm:h-28" : "aspect-square";
  const control = compact ? "h-9 w-9 text-lg sm:h-10 sm:w-10" : "h-10 w-10 text-xl";

  function step(delta: number, event?: React.MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    setIndex((value) => (value + delta + photos.length) % photos.length);
  }

  return (
    <div className={`relative overflow-hidden bg-brand-cream ${height}`}>
      {current ? (
        isRemote(current) ? (
          <Image src={current} alt={alt} fill className="object-cover" sizes={sizes} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : (
        <div className="flex h-full items-center justify-center font-display text-3xl text-brand-red">POW</div>
      )}
      {many && (
        <>
          <button type="button" aria-label="Previous photo" className={`absolute left-2 top-1/2 -translate-y-1/2 border-4 border-black bg-white ${control}`} onClick={(e) => step(-1, e)}>
            ‹
          </button>
          <button type="button" aria-label="Next photo" className={`absolute right-2 top-1/2 -translate-y-1/2 border-4 border-black bg-white ${control}`} onClick={(e) => step(1, e)}>
            ›
          </button>
          <p className="absolute bottom-2 right-2 border-4 border-black bg-white px-2 py-0.5 font-comic text-sm font-bold">
            {index + 1}/{photos.length}
          </p>
        </>
      )}
    </div>
  );
}

export function galleryFor(lot: Pick<Lot, "image" | "images">) {
  return lotImages(lot);
}
