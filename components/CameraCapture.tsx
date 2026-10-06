"use client";

import { useEffect, useRef, useState } from "react";
import {
  focusPointFromTap,
  refocusCamera,
  requestCamera,
  stopTracks,
  videoTrack,
  watchAutofocus,
} from "@/lib/cameraStream";

export { requestCamera, stopTracks };

function toJpegFile(blob: Blob) {
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  return new File([blob], `camera-${Date.now()}.jpg`, { type });
}

async function blobFromCanvas(canvas: HTMLCanvasElement) {
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (blob) return blob;
  } catch {
    /* tainted canvas */
  }
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

async function captureStill(video: HTMLVideoElement, stream: MediaStream | null, mirror: boolean) {
  const track = stream?.getVideoTracks()[0];
  const ImageCaptureCtor = (window as unknown as {
    ImageCapture?: new (track: MediaStreamTrack) => {
      takePhoto: () => Promise<Blob>;
      grabFrame: () => Promise<ImageBitmap>;
      getPhotoCapabilities?: () => Promise<{
        imageWidth?: { max?: number };
        imageHeight?: { max?: number };
      }>;
      setOptions?: (options: { imageWidth?: number; imageHeight?: number; focusMode?: string }) => Promise<void>;
    };
  }).ImageCapture;

  if (track && ImageCaptureCtor) {
    const capture = new ImageCaptureCtor(track);
    try {
      const caps = await capture.getPhotoCapabilities?.();
      const imageWidth = caps?.imageWidth?.max;
      const imageHeight = caps?.imageHeight?.max;
      if (imageWidth && imageHeight) {
        await capture.setOptions?.({ imageWidth, imageHeight, focusMode: "continuous" });
      } else {
        await capture.setOptions?.({ focusMode: "continuous" });
      }
    } catch {
      /* this camera takes the photo at its own size */
    }
    try {
      return await capture.takePhoto();
    } catch {
      try {
        const bitmap = await capture.grabFrame();
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          const blob = await blobFromCanvas(canvas);
          if (blob) return blob;
        }
      } catch {
        /* fall through to video frame */
      }
    }
  }

  const settings = track?.getSettings?.() ?? {};
  const width = video.videoWidth || Number(settings.width) || video.clientWidth || 1280;
  const height = video.videoHeight || Number(settings.height) || video.clientHeight || 960;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return blobFromCanvas(canvas);
}

export function CameraCapture({
  open,
  remaining,
  facing,
  stream,
  onCapture,
  onClose,
  onFlip,
}: {
  open: boolean;
  remaining: number;
  facing: "environment" | "user";
  stream: MediaStream | null;
  onCapture: (file: File) => void;
  onClose: () => void;
  onFlip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const track = videoTrack(stream);
    if (!track) return;
    return watchAutofocus(track);
  }, [open, stream]);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    setReady(false);
    if (!stream) {
      setError("Allow the camera in the browser prompt.");
      return;
    }
    setError(null);
    video.srcObject = stream;
    const markReady = () => setReady(true);
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    void video.play().then(markReady).catch(() => undefined);
    return () => {
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
      video.srcObject = null;
    };
  }, [open, stream]);

  async function aim(clientX: number, clientY: number) {
    const video = videoRef.current;
    const track = videoTrack(stream);
    if (!video || !track) return;
    const point = focusPointFromTap(video, clientX, clientY, facing === "user");
    if (!point) return;
    const rect = video.getBoundingClientRect();
    setFocusRing({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
    window.setTimeout(() => setFocusRing(null), 800);
    await refocusCamera(track, point);
  }

  async function snap() {
    const video = videoRef.current;
    if (!video || remaining <= 0 || snapping) return;
    setSnapping(true);
    setError(null);
    try {
      const track = videoTrack(stream);
      if (track) {
        await refocusCamera(track);
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
      const blob = await captureStill(video, stream, facing === "user");
      if (!blob || blob.size < 50) {
        setError("Could not grab that frame. Tap the red shutter again, or use Upload files.");
        return;
      }
      onCapture(toJpegFile(blob));
    } catch {
      setError("Capture failed on this camera. Try Upload files, or open this page on the phone.");
    } finally {
      setSnapping(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden comic-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 pb-2">
          <h2 id="camera-title" className="font-display text-3xl text-brand-red">
            Live camera
          </h2>
          <p className="mt-1 font-comic text-sm">
            Tap the writing or the item to refocus. The camera keeps focusing while you move. {remaining} left.
          </p>
        </div>
        <div className="relative min-h-[16rem] flex-1 overflow-hidden border-y-4 border-black bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              void aim(event.clientX, event.clientY);
            }}
            className={`h-full max-h-[55vh] w-full bg-black object-contain ${facing === "user" ? "scale-x-[-1]" : ""}`}
          />
          {focusRing ? (
            <span
              className="pointer-events-none absolute z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 border-4 border-white"
              style={{ left: `${focusRing.x}%`, top: `${focusRing.y}%` }}
            />
          ) : null}
          {!ready && !error && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-2xl text-white">
              Starting camera…
            </p>
          )}
          <button
            type="button"
            aria-label="Snap photo"
            onClick={() => void snap()}
            disabled={remaining <= 0 || snapping}
            className="absolute bottom-4 left-1/2 z-20 h-20 w-20 -translate-x-1/2 rounded-full border-4 border-white bg-brand-red shadow-[4px_4px_0_0_#000] disabled:opacity-50"
          />
        </div>
        {error && <p className="px-4 pt-2 font-comic text-sm text-brand-red">{error}</p>}
        <div className="flex flex-wrap gap-2 p-4">
          <button
            type="button"
            className="comic-btn"
            onClick={() => void snap()}
            disabled={remaining <= 0 || snapping}
          >
            {snapping ? "Saving…" : "Snap photo"}
          </button>
          <button
            type="button"
            className="comic-btn-invert"
            onClick={() => {
              const video = videoRef.current;
              const track = videoTrack(stream);
              if (!video || !track) return;
              const rect = video.getBoundingClientRect();
              void aim(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
          >
            Refocus
          </button>
          <button type="button" className="comic-btn-invert" onClick={onFlip}>
            Flip camera
          </button>
          <button type="button" className="comic-btn-invert" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
