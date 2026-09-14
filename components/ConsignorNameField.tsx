"use client";

export function ConsignorNameField({
  value,
  savedNames,
  onChange,
}: {
  value: string;
  savedNames: string[];
  onChange: (name: string) => void;
}) {
  return (
    <label className="block font-comic font-bold">
      Your name
      <input
        list="consignor-names"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        autoComplete="name"
        placeholder="Type your name, or pick it if you’ve consigned before"
        className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
      />
      <datalist id="consignor-names">
        {savedNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <span className="mt-1 block text-sm font-normal">
        Returning consignors: choose your name from the suggestions. New consignors: type it in.
      </span>
    </label>
  );
}
