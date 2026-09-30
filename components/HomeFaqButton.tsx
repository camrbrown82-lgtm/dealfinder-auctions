"use client";

import { TURBO_SLOTH_OPEN_EVENT } from "@/lib/registerFaq";

export function HomeFaqButton() {
  return (
    <button
      type="button"
      className="comic-btn !px-3 !py-1 !text-base sm:!text-xl"
      onClick={() => window.dispatchEvent(new Event(TURBO_SLOTH_OPEN_EVENT))}
    >
      FAQ
    </button>
  );
}
