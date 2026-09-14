"use client";

import Image from "next/image";

import { canUseNextImage } from "@/lib/imageUrls";

export function LotImage({
  src,
  alt,
  fill,
  className,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const useNative = !canUseNextImage(src);
  const contain = className?.includes("object-contain");
  const fitStyle = contain ? ({ objectFit: "contain" } as const) : undefined;
  if (useNative) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        style={fitStyle}
        className={
          fill ? `absolute inset-0 h-full w-full ${className ?? "object-cover"}` : className
        }
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      className={className}
      style={fitStyle}
      sizes={sizes}
      priority={priority}
    />
  );
}
