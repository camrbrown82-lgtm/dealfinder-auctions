"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/utils";

const PLACEHOLDER = "--:--:--";

export function LotTimer({
  endsAt,
  extended = false,
  compact = false,
}: {
  endsAt: string;
  fallback?: string;
  extended?: boolean;
  compact?: boolean;
}) {
  const [label, setLabel] = useState(PLACEHOLDER);

  useEffect(() => {
    const tick = () => setLabel(formatCountdown(endsAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const ended = label === "ENDED";

  return (
    <div className="text-center">
      <div
        suppressHydrationWarning
        className={`border-4 border-black font-display tabular-nums tracking-wide ${
          compact
            ? "min-w-[6.25rem] whitespace-nowrap px-2 py-1 text-base leading-none shadow-comic-red-sm sm:px-2.5 sm:text-lg"
            : "px-3 py-2 text-3xl sm:text-4xl"
        } ${ended ? "bg-black text-white" : "bg-white text-[#FF0000]"}`}
      >
        {label}
      </div>
      {extended && !ended && label !== PLACEHOLDER && (
        <p className="mt-1 font-comic text-xs font-bold uppercase">
          Anti-snipe: +2 minutes
        </p>
      )}
    </div>
  );
}
