"use client";

import { HOUSE_CONSIGNOR, isHouseConsignor } from "@/lib/consignors";

export function OwnerPicker({
  value = "",
  consignors = [],
  onChange,
  onSavedSelect,
  defaultKind = "house",
}: {
  value: string;
  consignors: string[];
  onChange: (name: string) => void;
  onSavedSelect?: (name: string) => void;
  defaultKind?: "house" | "consignor";
}) {
  const house =
    isHouseConsignor(value) || (value === "" && defaultKind === "house");
  const savedValue = house ? "" : value;
  const known = consignors.includes(savedValue);

  return (
    <div className="space-y-3">
      <label className="block font-comic font-bold">
        Owner
        <select
          value={house ? "house" : "consignor"}
          onChange={(event) => {
            if (event.target.value === "house") {
              onChange(HOUSE_CONSIGNOR);
              return;
            }
            onChange(consignors[0] ?? "");
          }}
          className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
        >
          <option value="house">House (DealFinder inventory)</option>
          <option value="consignor">Saved consignor</option>
        </select>
      </label>
      {!house && (
        <label className="block font-comic font-bold">
          Saved consignor
          <select
            value={known ? savedValue : savedValue ? "__custom__" : ""}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "__custom__") {
                onChange("");
                return;
              }
              onChange(next);
              onSavedSelect?.(next);
            }}
            required
            className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          >
            <option value="">Select a consignor…</option>
            {consignors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__custom__">New consignor…</option>
          </select>
        </label>
      )}
      {!house && !known && (
        <label className="block font-comic font-bold">
          New consignor name
          <input
            value={savedValue}
            onChange={(event) => onChange(event.target.value)}
            required
            className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            placeholder="Shop or consignor name"
          />
        </label>
      )}
    </div>
  );
}
