"use client";

export function ConsignorNameField({
  value,
}: {
  value: string;
}) {
  return (
    <label className="block font-comic font-bold">
      Your name
      <input
        value={value}
        readOnly
        required
        autoComplete="name"
        className="mt-2 w-full border-4 border-black bg-brand-cream px-3 py-2 font-normal"
      />
      <span className="mt-1 block text-sm font-normal">
        This is the name on your DealFinder account. Other consignors are not shown.
      </span>
    </label>
  );
}
