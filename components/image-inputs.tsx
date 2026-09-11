"use client";

import { useState } from "react";
import { parseImageUrls } from "@/lib/catalog";

export function UrlPaste({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block font-comic text-sm font-bold">
      Or paste image URL
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/item.jpg"
        className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
      />
      {parseImageUrls(value).length > 0 && (
        <span className="mt-2 flex flex-wrap gap-2">
          {parseImageUrls(value).map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-16 w-16 border-4 border-black object-cover" />
          ))}
        </span>
      )}
    </label>
  );
}

export function FilePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="comic-btn-invert !text-lg">
          Camera
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onChange([...files, ...Array.from(e.target.files)].slice(0, 4));
              e.target.value = "";
            }}
          />
        </label>
        <label className="comic-btn-invert !text-lg">
          Upload files
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onChange([...files, ...Array.from(e.target.files)].slice(0, 4));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="font-comic text-xs font-bold">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between">
              <span>
                {file.name} · {Math.round(file.size / 1024)}kb
              </span>
              <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))}>
                X
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DropPhotos({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const next = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
        onChange([...files, ...next].slice(0, 4));
      }}
      className={`border-4 border-dashed border-black p-6 text-center font-comic font-bold ${over ? "bg-white" : "bg-[#FFF7D1]"}`}
    >
      Drop photos here
      <p className="mt-1 text-xs">or use the camera / file picker (up to 4 photos per lot)</p>
      <div className="mt-3">
        <FilePicker files={files} onChange={onChange} />
      </div>
    </div>
  );
}
