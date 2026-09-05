"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/utils";

export function LotTimer({
  endsAt,
  fallback,
  extended = false,
}: {
  endsAt: string;
  fallback?: string;
  extended?: boolean;
}) {
  const [label, setLabel] = useState(fallback ?? formatCountdown(endsAt));

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
        className={`border-4 border-black px-4 py-2 font-display text-3xl ${
          ended
            ? "bg-black text-white"
            : "bg-[#FFF7D1] text-[#FF0000]"
        }`}
      >
        {label}
      </div>
      {extended && !ended && (
        <p className="mt-1 font-comic text-xs font-bold uppercase">
          Anti-snipe: +2 minutes
        </p>
      )}
    </div>
  );
}
