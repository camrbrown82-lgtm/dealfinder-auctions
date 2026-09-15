"use client";

import {
  PREAUTH_DISCLAIMER,
  PREAUTH_DISCLAIMER_TITLE,
} from "@/lib/helcimCopy";

export function PreauthDisclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
        <strong>{PREAUTH_DISCLAIMER_TITLE}.</strong> {PREAUTH_DISCLAIMER}
      </p>
    );
  }
  return (
    <div className="border-4 border-black bg-white px-3 py-2">
      <p className="font-display text-xl">{PREAUTH_DISCLAIMER_TITLE}</p>
      <p className="mt-1 font-comic text-sm">{PREAUTH_DISCLAIMER}</p>
    </div>
  );
}
