"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CameraCapture, requestCamera, stopTracks } from "@/components/CameraCapture";

type PhotoDropzoneProps = {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  hidePreviews?: boolean;
  onCameraFinished?: (files: File[]) => void;
};

export function PhotoDropzone({
  files,
  onChange,
  maxFiles = 4,
  hidePreviews = false,
  onCameraFinished,
}: PhotoDropzoneProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [stream, setStream] = useState<MediaStream | null>(null);

  const previews = useMemo(
    () => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [previews]);

  useEffect(() => {
    return () => stopTracks(stream);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function merge(next: FileList | File[]) {
    const incoming = Array.from(next).filter(
      (file) => !file.type || file.type.startsWith("image/") || file.type === "application/octet-stream",
    );
    const combined = [...files, ...incoming].slice(0, maxFiles);
    onChange(combined);
  }

  const remaining = Math.max(0, maxFiles - files.length);

  function closeCamera() {
    stopTracks(stream);
    setStream(null);
    setCameraOpen(false);
    onCameraFinished?.(files);
  }

  async function openLiveCamera(nextFacing: "environment" | "user" = facing) {
    const next = await requestCamera(nextFacing);
    if (!next) {
      nativeCameraRef.current?.click();
      return;
    }
    stopTracks(stream);
    setFacing(nextFacing);
    setStream(next);
    setCameraOpen(true);
  }

  useEffect(() => {
    if (cameraOpen && remaining <= 0) closeCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, remaining]);

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
        className={`border-4 border-dashed border-black bg-brand-cream p-6 text-center shadow-comic-red-sm ${
          dragging ? "bg-white" : ""
        }`}
      >
        <p className="font-display text-2xl">Drop photos here</p>
        <p className="mt-1 font-comic text-sm">
          Webcam, phone camera, or files (up to {maxFiles} photo{maxFiles === 1 ? "" : "s"} per lot)
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="comic-btn !text-base"
            onClick={() => void openLiveCamera("environment")}
            disabled={remaining <= 0}
          >
            Camera
          </button>
          <button
            type="button"
            className="comic-btn-invert !text-base"
            onClick={() => galleryRef.current?.click()}
            disabled={remaining <= 0}
          >
            Upload files
          </button>
        </div>
        <input
          ref={nativeCameraRef}
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
          multiple={maxFiles > 1}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) merge(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {previews.length > 0 && !hidePreviews && (
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

      <CameraCapture
        open={cameraOpen}
        remaining={remaining}
        facing={facing}
        stream={stream}
        onCapture={(file) => merge([file])}
        onClose={closeCamera}
        onFlip={() => void openLiveCamera(facing === "environment" ? "user" : "environment")}
      />
    </div>
  );
}
