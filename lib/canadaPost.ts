import { money } from "@/lib/invoiceFees";
import { REGULAR_PARCEL_BANDS } from "@/lib/regularParcelBands";

/** Regular Parcel cubes at 6,000. Expedited, Xpresspost, and Priority cube at 5,000. */
export const REGULAR_DENSITY = 6000;
export const EXPEDITED_DENSITY = 5000;
export const MAX_PARCEL_KG = 30;
export const MAX_SIDE_CM = 200;
export const MAX_LENGTH_GIRTH_CM = 300;

export type CanadaPostZone = "alberta" | "west" | "central" | "atlantic" | "north";

export function volumetricKg(lengthCm: number, widthCm: number, heightCm: number, density = REGULAR_DENSITY) {
  const cube = Math.max(0, lengthCm) * Math.max(0, widthCm) * Math.max(0, heightCm);
  if (!density) return 0;
  return cube / density;
}

/** Next 0.5 kg step, matching the Regular Parcel price sheet. */
export function billableKg(weightKg: number, lengthCm: number, widthCm: number, heightCm: number) {
  const actual = Math.max(0, weightKg);
  const volumetric = volumetricKg(lengthCm, widthCm, heightCm, REGULAR_DENSITY);
  const raw = Math.max(actual, volumetric);
  return Math.max(0.5, Math.ceil(raw * 2 - 1e-9) / 2);
}

export function publishedRegularBand(billable: number) {
  const row = REGULAR_PARCEL_BANDS.find((band) => billable <= band[0]) ?? REGULAR_PARCEL_BANDS[REGULAR_PARCEL_BANDS.length - 1];
  if (!row || billable > MAX_PARCEL_KG) return null;
  return { weightKg: row[0], low: money(row[1]), high: money(row[2]) };
}

export function parcelProblems(input: {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}) {
  const problems: string[] = [];
  const sides = [input.lengthCm, input.widthCm, input.heightCm].filter((n) => n > 0).sort((a, b) => b - a);
  const longest = sides[0] ?? 0;
  const girth = longest + 2 * ((sides[1] ?? 0) + (sides[2] ?? 0));
  if (
    input.weightKg > MAX_PARCEL_KG ||
    billableKg(input.weightKg, input.lengthCm, input.widthCm, input.heightCm) > MAX_PARCEL_KG
  ) {
    problems.push("Canada Post parcels cannot exceed 30 kg actual or volumetric weight.");
  }
  if (longest > MAX_SIDE_CM) problems.push("No side can be longer than 200 cm.");
  if (sides.length === 3 && girth > MAX_LENGTH_GIRTH_CM) {
    problems.push("Length plus girth cannot exceed 300 cm.");
  }
  return problems;
}

export function zoneFromAddress(address: string): CanadaPostZone {
  const text = address.toUpperCase();
  const match = text.match(/[ABCEGHJ-NPRSTVXY]\d[A-Z]\s?\d[A-Z]\d/);
  const letter = match?.[0]?.[0] ?? "";
  if (letter === "T") return "alberta";
  if (letter === "V" || letter === "S" || letter === "R") return "west";
  if ("GHJKLMNP".includes(letter)) return "central";
  if ("ABCE".includes(letter)) return "atlantic";
  if (letter === "X" || letter === "Y") return "north";
  if (/\bAB\b|ALBERTA/.test(text)) return "alberta";
  if (/\b(BC|SK|MB)\b|BRITISH COLUMBIA|SASKATCHEWAN|MANITOBA/.test(text)) return "west";
  if (/\b(ON|QC)\b|ONTARIO|QUEBEC/.test(text)) return "central";
  if (/\b(NB|NS|PE|NL)\b|NEW BRUNSWICK|NOVA SCOTIA|PRINCE EDWARD|NEWFOUNDLAND/.test(text)) return "atlantic";
  if (/\b(YT|NT|NU)\b|YUKON|NORTHWEST|NUNAVUT/.test(text)) return "north";
  return "central";
}

export function zoneLabel(zone: CanadaPostZone) {
  if (zone === "alberta") return "Alberta";
  if (zone === "west") return "B.C., Saskatchewan, or Manitoba";
  if (zone === "central") return "Ontario or Quebec";
  if (zone === "atlantic") return "Atlantic Canada";
  return "Territories";
}

export function canadaPostPostage(input: {
  address: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}) {
  const volumetric = volumetricKg(input.lengthCm, input.widthCm, input.heightCm, REGULAR_DENSITY);
  const expeditedVolumetric = volumetricKg(input.lengthCm, input.widthCm, input.heightCm, EXPEDITED_DENSITY);
  const billable = billableKg(input.weightKg, input.lengthCm, input.widthCm, input.heightCm);
  const band = publishedRegularBand(billable);
  return {
    zone: zoneFromAddress(input.address),
    zoneLabel: zoneLabel(zoneFromAddress(input.address)),
    volumetricKg: Math.round(volumetric * 100) / 100,
    expeditedVolumetricKg: Math.round(expeditedVolumetric * 100) / 100,
    billableKg: billable,
    low: band?.low ?? 0,
    high: band?.high ?? 0,
    service: "Regular Parcel",
    problems: parcelProblems(input),
  };
}
