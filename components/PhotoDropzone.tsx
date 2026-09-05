"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PhotoDropzoneProps = {
  files: File[];
  onChange: (files: File[]) => void;
};

export function PhotoDropzone({ files, onChange }: PhotoDropzoneProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const previews = useMemo(
    () => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [previews]);

  function merge(next: FileList | File[]) {
    const incoming = Array.from(next).filter((file) => file.type.startsWith("image/"));
    const combined = [...files, ...incoming].slice(0, 4);
    onChange(combined);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          merge(event.dataTransfer.files);
        }}
        className={`border-4 border-dashed border-black bg-brand-cream p-6 text-center ${
          dragging ? "bg-white" : ""
        }`}
      >
        <p className="font-display text-2xl">Drop photos here</p>
        <p className="mt-1 font-comic text-sm">or use the camera / file picker (up to 4)</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="comic-btn !text-base"
            onClick={() => cameraRef.current?.click()}
          >
            Camera
          </button>
          <button
            type="button"
            className="comic-btn-invert !text-base"
            onClick={() => galleryRef.current?.click()}
          >
            Upload files
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) merge(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) merge(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {previews.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {previews.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative border-4 border-black bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.url} alt={file.name} className="h-28 w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 border-2 border-black bg-brand-red px-2 font-display text-sm text-white"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                X
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
