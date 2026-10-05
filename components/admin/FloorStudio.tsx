"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { FLOOR_CLIPS_BUCKET, floorClipCaption, type FloorClip } from "@/lib/floorClips";

const SOCIALS = [
  { label: "YouTube", href: "https://www.youtube.com/upload" },
  { label: "Facebook", href: "https://www.facebook.com/reels/create" },
  { label: "TikTok", href: "https://www.tiktok.com/tiktokstudio/upload" },
  { label: "Instagram", href: "https://www.instagram.com/" },
] as const;

function cameraDenied(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The browser blocked the camera. Allow camera access for this site, then press Start camera again.";
  }
  if (name === "NotFoundError") return "No camera was found on this computer.";
  if (name === "NotReadableError") return "Another app is using the camera. Close it, then press Start camera again.";
  return "The camera did not start. Allow it in the browser prompt and try again.";
}

function recorderMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

async function clipFile(url: string, title: string, local?: Blob | null) {
  const blob = local ?? (await (await fetch(url)).blob());
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const name = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "item"}.${ext}`;
  return new File([blob], name, { type: blob.type || "video/webm" });
}

function ClipExport({
  clip,
  localBlob,
  deleting,
  onDelete,
}: {
  clip: FloorClip;
  localBlob?: Blob | null;
  deleting: boolean;
  onDelete: (clip: FloorClip) => void;
}) {
  const [notice, setNotice] = useState("");

  async function download() {
    const file = await clipFile(clip.publicUrl, clip.title, localBlob);
    const href = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = href;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function share(href: string) {
    const caption = floorClipCaption(clip.title);
    await navigator.clipboard.writeText(caption).catch(() => undefined);
    await download();
    window.open(href, "_blank", "noopener,noreferrer");
    setNotice("Caption copied and the video file downloaded. Drop that file into the upload page that just opened.");
  }

  async function deviceShare() {
    const file = await clipFile(clip.publicUrl, clip.title, localBlob);
    const caption = floorClipCaption(clip.title);
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: clip.title, text: caption });
      return;
    }
    await navigator.clipboard.writeText(caption).catch(() => undefined);
    await download();
    setNotice("This browser cannot hand the file to another app. The video downloaded and the caption was copied.");
  }

  return (
    <div className="space-y-2">
      <p className="font-comic text-sm font-bold">{clip.title}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="comic-btn" onClick={() => void download()}>
          Download
        </button>
        <button type="button" className="comic-btn-invert" onClick={() => void deviceShare()}>
          Share file
        </button>
        {SOCIALS.map((social) => (
          <button key={social.label} type="button" className="comic-btn-invert" onClick={() => void share(social.href)}>
            {social.label}
          </button>
        ))}
        <button type="button" className="comic-btn" disabled={deleting} onClick={() => onDelete(clip)}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
      {notice ? <p className="font-comic text-sm">{notice}</p> : null}
    </div>
  );
}

export function FloorStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "starting" | "live" | "recording" | "saving">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [clips, setClips] = useState<FloorClip[]>([]);
  const [freshBlob, setFreshBlob] = useState<Blob | null>(null);
  const [freshId, setFreshId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    void fetch("/api/admin/stream")
      .then((response) => response.json())
      .then((body: { clips?: FloorClip[] }) => setClips(body.clips ?? []))
      .catch(() => undefined);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = preview;
    if (!preview) return;
    void video.play().catch(() => undefined);
  }, [preview]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function startCamera() {
    setError("");
    setPhase("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser will not open the camera here. Use https://www.dealfinderauctions.com in Chrome or Edge.");
      setPhase("idle");
      return;
    }
    const attempts: MediaStreamConstraints[] = [
      { audio: true, video: { facingMode: { ideal: "environment" } } },
      { audio: true, video: true },
      { audio: false, video: true },
    ];
    let stream: MediaStream | null = null;
    let reason = "Allow the camera when the browser asks, then press Start camera again.";
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        reason = cameraDenied(err);
      }
    }
    if (!stream) {
      setError(reason);
      setPhase("idle");
      return;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = stream;
    setPreview(stream);
    setPhase("live");
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = recorderMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 1_200_000 } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      void saveClip(blob);
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setSeconds(0);
    setPhase("recording");
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setPhase("saving");
  }

  async function saveClip(blob: Blob) {
    setError("");
    const itemTitle = title.trim() || "New item";
    const prepared = await fetch("/api/admin/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", title: itemTitle, contentType: blob.type }),
    });
    const prep = (await prepared.json()) as { error?: string; path?: string; token?: string };
    if (!prepared.ok || !prep.path || !prep.token) {
      setError(prep.error || "Could not start the upload.");
      setPhase("live");
      return;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setError("Supabase is not configured in this browser.");
      setPhase("live");
      return;
    }
    const supabase = createClient(url, key);
    const uploaded = await supabase.storage.from(FLOOR_CLIPS_BUCKET).uploadToSignedUrl(prep.path, prep.token, blob, {
      contentType: blob.type || "video/webm",
    });
    if (uploaded.error) {
      setError(uploaded.error.message);
      setPhase("live");
      return;
    }
    const published = await fetch("/api/admin/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", title: itemTitle, path: prep.path }),
    });
    const body = (await published.json()) as { error?: string; clip?: FloorClip };
    if (!published.ok || !body.clip) {
      setError(body.error || "The video uploaded, but it was not added to Media.");
      setPhase("live");
      return;
    }
    setFreshBlob(blob);
    setFreshId(body.clip.id);
    setClips((current) => [body.clip!, ...current]);
    setTitle("");
    setPhase("live");
  }

  async function removeClip(clip: FloorClip) {
    if (!window.confirm(`Delete ${clip.title}? It comes off the media page.`)) return;
    setDeletingId(clip.id);
    setError("");
    const response = await fetch(`/api/admin/stream?id=${encodeURIComponent(clip.id)}`, { method: "DELETE" });
    const body = (await response.json()) as { error?: string };
    setDeletingId("");
    if (!response.ok) {
      setError(body.error || "Could not delete that video.");
      return;
    }
    setClips((current) => current.filter((row) => row.id !== clip.id));
    if (freshId === clip.id) {
      setFreshId("");
      setFreshBlob(null);
    }
  }

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const latest = clips.find((clip) => clip.id === freshId) ?? null;

  return (
    <div className="space-y-6">
      <div className="comic-panel space-y-3 p-4">
        <label className="block font-comic text-sm font-bold">
          Item
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What just came in"
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <div className="relative overflow-hidden border-4 border-black bg-black">
          <video ref={videoRef} muted playsInline autoPlay className="aspect-video w-full bg-black object-contain" />
          {phase === "idle" || phase === "starting" ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center font-display text-3xl text-white">
              {phase === "starting" ? "Starting camera…" : "Press Start camera to see the picture"}
            </p>
          ) : null}
          {phase === "live" ? (
            <p className="absolute left-3 top-3 bg-black px-2 py-1 font-display text-xl text-white">Camera on</p>
          ) : null}
          {phase === "recording" ? (
            <p className="absolute left-3 top-3 bg-brand-red px-2 py-1 font-display text-xl text-white">Live {clock}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === "idle" || phase === "starting" ? (
            <button
              type="button"
              className="comic-btn"
              disabled={phase === "starting"}
              onClick={() => void startCamera()}
            >
              {phase === "starting" ? "Starting camera…" : "Start camera"}
            </button>
          ) : null}
          {phase === "live" ? (
            <button type="button" className="comic-btn" onClick={startRecording}>
              Record
            </button>
          ) : null}
          {phase === "recording" ? (
            <button type="button" className="comic-btn" onClick={stopRecording}>
              Stop and save to Media
            </button>
          ) : null}
          {phase === "saving" ? <p className="font-display text-2xl text-brand-red">Saving…</p> : null}
        </div>
        {error ? <p className="border-4 border-black bg-brand-red p-3 font-comic text-white">{error}</p> : null}
      </div>

      {latest ? (
        <div className="comic-panel space-y-3 p-4">
          <p className="font-display text-2xl text-brand-red">Saved to Media</p>
          <video src={latest.publicUrl} controls playsInline className="aspect-video w-full bg-black" />
          <ClipExport
            clip={latest}
            localBlob={freshBlob}
            deleting={deletingId === latest.id}
            onDelete={(clip) => void removeClip(clip)}
          />
        </div>
      ) : null}

      <div className="comic-panel space-y-4 p-4">
        <p className="font-display text-2xl">Earlier clips</p>
        {clips.length === 0 ? <p className="font-comic text-sm">Nothing filmed yet.</p> : null}
        {clips.map((clip) => (
          <div key={clip.id} className="border-t-4 border-black pt-3">
            <video src={clip.publicUrl} controls playsInline className="mb-2 aspect-video w-full max-w-md bg-black" />
            <ClipExport
              clip={clip}
              localBlob={clip.id === freshId ? freshBlob : null}
              deleting={deletingId === clip.id}
              onDelete={(item) => void removeClip(item)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
