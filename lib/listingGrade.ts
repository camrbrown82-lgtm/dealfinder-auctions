export const LISTING_STARS = [1, 2, 3, 4, 5] as const;
export type ListingGrade = "1" | "2" | "3" | "4" | "5";
export const DEFAULT_LISTING_GRADE: ListingGrade = "3";

export function starPhrase(grade: ListingGrade) {
  const stars = Number(grade);
  return `${stars} out of 5 star${stars === 1 ? "" : "s"}`;
}

export function parseListingGrade(value: unknown): ListingGrade {
  const raw = String(value ?? "").trim();
  const direct = raw.match(/^([1-5])(?:\s*(?:\/|out of)\s*5(?:\s*stars?)?)?$/i);
  if (direct) return direct[1] as ListingGrade;
  const rated = raw.match(/([1-5])\s*(?:out of|\/)\s*5/i);
  if (rated) return rated[1] as ListingGrade;
  if (/^new$/i.test(raw)) return "5";
  if (/^issues?$/i.test(raw)) return "1";
  if (/^used$/i.test(raw)) return "3";
  return DEFAULT_LISTING_GRADE;
}

export function listingGradeFromSources(grade: unknown, description?: string | null): ListingGrade {
  const raw = String(grade ?? "").trim();
  if (/^[1-5]$/.test(raw) || /^new$/i.test(raw) || /^issues?$/i.test(raw) || /^used$/i.test(raw)) {
    return parseListingGrade(raw);
  }
  const text = String(description ?? "");
  const rated = text.match(/([1-5]) out of 5/i);
  if (rated) return rated[1] as ListingGrade;
  const listed = text.match(/Listed as (Used|New|Issues)/i);
  if (listed) return parseListingGrade(listed[1]);
  return DEFAULT_LISTING_GRADE;
}

export function withListedGrade(description: string, grade: ListingGrade) {
  const cleaned = description
    .replace(/\s*Listed as (Used|New|Issues)\.?/gi, "")
    .replace(/\s*Rated \d out of 5 stars?\.?/gi, "")
    .trim();
  return `${cleaned} Rated ${starPhrase(grade)}.`.trim();
}

export function listingGradeOf(lot: { listingGrade?: string | null; description?: string | null }): ListingGrade {
  return listingGradeFromSources(lot.listingGrade, lot.description);
}

export function catalogCondition(grade: ListingGrade): "new" | "used" {
  return grade === "5" ? "new" : "used";
}

export function ebayConditionId(grade: ListingGrade) {
  if (grade === "5") return "NEW";
  if (grade === "4") return "USED_EXCELLENT";
  if (grade === "3") return "USED_VERY_GOOD";
  if (grade === "2") return "USED_GOOD";
  return "USED_ACCEPTABLE";
}
