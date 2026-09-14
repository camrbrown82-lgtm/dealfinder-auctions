"use client";

import { useState } from "react";
import type { AiRun } from "@/lib/aiRuns";

export function AiFeedback({
  run,
  summary,
  staff = false,
}: {
  run: AiRun | null;
  summary: string;
  staff?: boolean;
}) {
  const [rating, setRating] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!run?.ids.length && !summary.trim()) return null;
  if (done) {
    return (
      <p className="border-4 border-black bg-white p-3 font-comic text-sm font-bold">
        Thanks — feedback sent.
      </p>
    );
  }

  async function submit(next: "good" | "bad") {
    setRating(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: next,
          comment,
          summary,
          ids: run?.ids ?? [],
          features: run?.features ?? [],
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not send feedback.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-4 border-black bg-white p-3 font-comic text-sm">
      <p className="font-display text-lg text-brand-red">Rate this AI result</p>
      <p className="mt-1">
        {staff
          ? "Thumbs send this generation to OpenAI. With data sharing on in your OpenAI org, shared traffic can earn complimentary daily tokens."
          : "Tell us if the catalog and listing photo look right. This is sent to OpenAI to improve results."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={rating === "good" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
          disabled={busy}
          onClick={() => void submit("good")}
        >
          Looks good
        </button>
        <button
          type="button"
          className={rating === "bad" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
          disabled={busy}
          onClick={() => void submit("bad")}
        >
          Needs work
        </button>
      </div>
      <label className="mt-2 block font-bold">
        Optional note
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={busy}
          placeholder="Wrong object, price off, photo too busy…"
          className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
        />
      </label>
      {error && <p className="mt-2 font-bold text-brand-red">{error}</p>}
    </div>
  );
}
