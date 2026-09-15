"use client";

import {
  PREAUTH_AGREEMENT,
  PREAUTH_DISCLAIMER,
  PREAUTH_DISCLAIMER_TITLE,
} from "@/lib/helcimCopy";

export function PreauthDisclaimer({
  compact = false,
  agreed,
  onAgree,
  id = "preauth-agree",
}: {
  compact?: boolean;
  agreed?: boolean;
  onAgree?: (next: boolean) => void;
  id?: string;
}) {
  return (
    <div className="border-4 border-black bg-white px-3 py-2">
      <p className="font-display text-xl">{PREAUTH_DISCLAIMER_TITLE}</p>
      <p className={`mt-1 font-comic text-sm ${compact ? "" : ""}`}>{PREAUTH_DISCLAIMER}</p>
      {onAgree ? (
        <label htmlFor={id} className="mt-3 flex items-start gap-2 font-comic text-sm font-bold">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(agreed)}
            onChange={(event) => onAgree(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[#FF0000]"
            required
          />
          <span>{PREAUTH_AGREEMENT}</span>
        </label>
      ) : null}
    </div>
  );
}
