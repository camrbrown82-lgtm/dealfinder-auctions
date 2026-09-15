export const HOUSE_CONSIGNOR = "House stock";

const HOUSE_ALIASES = new Set(["house stock", "house", "dealfinder", "dealfinder auctions"]);

export function isHouseConsignor(name?: string | null) {
  const value = name?.trim().toLowerCase();
  if (!value) return false;
  return HOUSE_ALIASES.has(value);
}

export function uniqueConsignorNames(
  ...lists: Array<Array<{ consignor?: string | null } | string | null | undefined>>
) {
  const names = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const row of list) {
      const value = typeof row === "string" ? row : row?.consignor;
      const name = value?.trim();
      if (!name || isHouseConsignor(name)) continue;
      names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
