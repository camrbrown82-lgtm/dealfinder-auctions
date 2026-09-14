"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { LotImage } from "@/components/LotImage";

type GalleryVariant = "card" | "compact" | "room";

export function LotGallery({
  images,
  alt,
  variant = "card",
  sizes,
  priority,
  fit = "cover",
}: {
  images: string[];
  alt: string;
  variant?: GalleryVariant;
  sizes?: string;
  priority?: boolean;
  fit?: "cover" | "contain";
}) {
  const photos = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, Math.max(photos.length - 1, 0))] ?? "";
  const many = photos.length > 1;
  const compact = variant === "compact";

  useEffect(() => {
    setIndex(0);
  }, [photos.join("|")]);

  useEffect(() => {
    if (variant !== "room" || !many) return;
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

  function stop(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function go(delta: number, event: MouseEvent) {
    stop(event);
    setIndex((value) => (value + delta + photos.length) % photos.length);
  }

  const chevron =
    compact
      ? "h-7 w-7 text-sm"
      : "h-9 w-9 text-lg sm:h-10 sm:w-10";

  return (
    <div className={variant === "room" ? "space-y-3" : "absolute inset-0"}>
      <div
        className={
          variant === "room"
            ? "relative aspect-square overflow-hidden bg-brand-cream"
            : "absolute inset-0"
        }
      >
        {current ? (
          <LotImage
            src={current}
            alt={alt}
            fill
            className={fit === "contain" ? "object-contain" : "object-cover"}
            sizes={sizes}
            priority={priority}
          />
        ) : null}

        {many && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              className={`absolute left-1 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center border-4 border-brand-ink bg-brand-paper font-display shadow-comic-sm ${chevron}`}
              onClick={(event) => go(-1, event)}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              className={`absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center border-4 border-brand-ink bg-brand-paper font-display shadow-comic-sm ${chevron}`}
              onClick={(event) => go(1, event)}
            >
              ›
            </button>
            <span
              className={`absolute bottom-2 right-2 z-10 border-4 border-brand-ink bg-brand-red font-display text-brand-paper ${
                compact ? "px-1 py-0 text-[10px]" : "px-2 py-0.5 text-sm"
              }`}
            >
              {index + 1}/{photos.length}
            </span>
          </>
        )}
      </div>

      {variant === "room" && many && (
        <div className="flex flex-wrap gap-2 px-4 pb-1">
          {photos.map((src, photoIndex) => {
            const active = photoIndex === index;
            return (
              <button
                key={src}
                type="button"
                aria-label={`Photo ${photoIndex + 1}`}
                aria-current={active ? true : undefined}
                onClick={() => setIndex(photoIndex)}
                className={`relative h-16 w-16 overflow-hidden border-4 ${
                  active ? "border-brand-red" : "border-brand-ink"
                }`}
              >
                <LotImage src={src} alt="" fill className="object-cover" sizes="64px" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
