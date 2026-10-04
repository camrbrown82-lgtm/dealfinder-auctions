import { money } from "@/lib/invoiceFees";

/** Rough checkout estimate until the shipping desk weighs the box and enters Canada Post postage. */
export function estimateCarrierShipping(input: {
  province?: string | null;
  postalCode?: string | null;
  weightKg?: number | null;
}) {
  const province = String(input.province ?? "AB").trim().toUpperCase();
  const weight = Math.max(0.5, Number(input.weightKg ?? 2) || 2);
  let base = 28;
  if (province === "AB") base = 12;
  else if (["BC", "SK", "MB"].includes(province)) base = 18;
  else if (["ON", "QC"].includes(province)) base = 22;
  else if (["YT", "NT", "NU"].includes(province)) base = 40;
  const extra = Math.max(0, weight - 2) * 2.5;
  const postal = String(input.postalCode ?? "").replace(/\s/g, "").toUpperCase();
  const remote = postal.startsWith("X") || postal.startsWith("Y") ? 8 : 0;
  return money(base + extra + remote);
}
