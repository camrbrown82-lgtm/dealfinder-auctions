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
        className={`border-4 border-black font-display ${
          compact ? "px-1.5 py-0.5 text-sm sm:text-base" : "px-4 py-2 text-3xl"
        } ${ended ? "bg-black text-white" : "bg-[#FFF7D1] text-[#FF0000]"}`}
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
