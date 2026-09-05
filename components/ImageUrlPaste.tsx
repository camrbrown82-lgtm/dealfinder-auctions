"use client";

import { parsePastedImageUrls } from "@/lib/imageUrls";

export function ImageUrlPaste({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const previews = parsePastedImageUrls(value);

  return (
    <div className="space-y-2">
      <label className="block font-comic font-bold">
        Or paste image URL
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
          placeholder="https://example.com/item.jpg"
        />
      </label>
      <p className="font-comic text-xs">
        Direct http(s) photo links. One per line, or comma-separated. Combine with dropped
        photos if you want.
      </p>
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="h-16 w-16 border-4 border-black object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
