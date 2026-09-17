export type SalesViewMode = "itemized" | "grouped";

export function parseSalesView(value?: string | null): SalesViewMode {
  return value === "grouped" ? "grouped" : value === "itemized" ? "itemized" : "grouped";
}

export function salesViewLabel(view: SalesViewMode) {
  return view === "itemized" ? "Itemized Sales View" : "Grouped Buyer Invoice View";
}
