"use client";

import { LISTING_GRADES, type ListingGrade } from "@/lib/listingGrade";

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
    <div className="space-y-3">
      <label className="block font-comic font-bold">
        Item details for AI
        <textarea
          value={details}
          onChange={(event) => onDetails(event.target.value)}
          rows={3}
          placeholder="Size, extras, wear, missing parts, what’s included…"
          className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
        />
      </label>
      <div>
        <p className="font-comic font-bold">Listing condition</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LISTING_GRADES.map((option) => (
            <button
              key={option}
              type="button"
              className={grade === option ? "comic-btn" : "comic-btn-invert"}
              onClick={() => onGrade(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
