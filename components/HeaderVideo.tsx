"use client";

import Image from "next/image";
import { useState } from "react";

const VIDEO_ID = "dQw4w9WgXcQ";

export function HeaderVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <button
      type="button"
      aria-label={playing ? "Never Gonna Give You Up" : "Play Never Gonna Give You Up"}
      onClick={() => setPlaying(true)}
      className={`flex items-center justify-center overflow-hidden border-4 border-brand-cream bg-black p-1 shadow-comic-sm ${
        playing ? "h-36 w-64 sm:h-44 sm:w-80" : ""
      }`}
    >
      {playing ? (
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&playsinline=1`}
          title="Never Gonna Give You Up"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <Image
          src={`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`}
          alt=""
          width={96}
          height={96}
          className="h-10 w-10 scale-150 object-cover sm:h-12 sm:w-12"
        />
      )}
    </button>
  );
}
