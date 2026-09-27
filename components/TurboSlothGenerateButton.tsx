"use client";

import { SLOTH_PHOTO_STATUS, type SlothPhotoAudience, type SlothPhotoPhase } from "@/lib/turboSloth";

export function TurboSlothGenerateButton({
  audience,
  phase,
  onClick,
  className = "",
}: {
  audience: SlothPhotoAudience;
  phase: SlothPhotoPhase | null;
  onClick: () => void;
  className?: string;
}) {
  const busy = phase !== null;
  const label = busy ? SLOTH_PHOTO_STATUS[audience][phase] : "Auto-Generate Details";
  return (
    <button
      type="button"
      className={`comic-btn w-full whitespace-normal leading-tight ${className}`}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      aria-live="polite"
    >
      {busy ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-4 border-white border-t-transparent"
            aria-hidden
          />
          <span>{label}</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export function ListingGalleryThumbs({ urls, heroIndex }: { urls: string[]; heroIndex: number }) {
  const gallery = urls.filter((_, index) => index !== heroIndex);
  if (gallery.length === 0) return null;
  return (
    <div>
      <p className="font-comic text-xs">Gallery</p>
      <div className="mt-1 flex gap-2 overflow-x-auto">
        {gallery.map((url, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${index}-${url.slice(0, 24)}`}
            src={url}
            alt=""
            className="h-16 w-16 shrink-0 border-4 border-black bg-white object-cover"
          />
        ))}
      </div>
    </div>
  );
}
