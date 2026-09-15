export const LISTING_GRADES = ["Used", "New", "Issues"] as const;
export type ListingGrade = (typeof LISTING_GRADES)[number];

export function parseListingGrade(value: unknown): ListingGrade {
  const raw = String(value ?? "").trim();
  if (raw === "New" || raw === "Issues" || raw === "Used") return raw;
  return "Used";
}

export function listingGradeFromSources(grade: unknown, description?: string | null): ListingGrade {
  const raw = String(grade ?? "").trim();
  if (raw === "New" || raw === "Issues" || raw === "Used") return raw;
  const listed = String(description ?? "").match(/Listed as (Used|New|Issues)/i);
  if (listed) return listed[1] as ListingGrade;
  return "Used";
}

export function withListedGrade(description: string, grade: ListingGrade) {
  const cleaned = description.replace(/\s*Listed as (Used|New|Issues)\.?/gi, "").trim();
  return `${cleaned} Listed as ${grade}.`.trim();
}

export function listingGradeOf(lot: { listingGrade?: string | null; description?: string | null }): ListingGrade {
  return listingGradeFromSources(lot.listingGrade, lot.description);
}
