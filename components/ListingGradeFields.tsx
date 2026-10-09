"use client";

import { GrowingTextarea } from "@/components/GrowingTextarea";
import { LISTING_STARS, starPhrase, type ListingGrade } from "@/lib/listingGrade";

export function ItemDetailsField({
  details,
  onDetails,
}: {
  details: string;
  onDetails: (value: string) => void;
}) {
  return (
    <label className="block font-comic font-bold">
      Item details for AI
      <GrowingTextarea
        value={details}
        onChange={(event) => onDetails(event.target.value)}
        rows={2}
        maxRows={6}
        placeholder="Size, extras, wear, missing parts, what’s included…"
        className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
      />
    </label>
  );
}

export function ListingConditionField({
  grade,
  onGrade,
}: {
  grade: ListingGrade;
  onGrade: (value: ListingGrade) => void;
}) {
  const selected = Number(grade);
  return (
    <div>
      <p className="font-comic font-bold">Condition</p>
      <p className="font-comic text-sm">Tap a star. Five is the best shape this lot is in.</p>
      <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Condition, 1 to 5 stars">
        {LISTING_STARS.map((option) => {
          const value = String(option) as ListingGrade;
          const on = option <= selected;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={grade === value}
              aria-label={starPhrase(value)}
              className={`border-4 border-black px-3 py-2 font-display text-3xl leading-none shadow-comic-sm ${
                on ? "bg-brand-red text-white" : "bg-white text-black/30"
              }`}
              onClick={() => onGrade(value)}
            >
              ★
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ListingGradeFields({
  details,
  grade,
  onDetails,
  onGrade,
}: {
  details: string;
  grade: ListingGrade;
  onDetails: (value: string) => void;
  onGrade: (value: ListingGrade) => void;
}) {
  return (
    <div className="space-y-4">
      <ItemDetailsField details={details} onDetails={onDetails} />
      <ListingConditionField grade={grade} onGrade={onGrade} />
    </div>
  );
}
