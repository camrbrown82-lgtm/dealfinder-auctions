export type CameraFacing = "environment" | "user";
export type FocusPoint = { x: number; y: number };

type ModeList = { focusMode?: string[]; exposureMode?: string[]; whiteBalanceMode?: string[]; pointsOfInterest?: boolean };

function trackCapabilities(track: MediaStreamTrack): ModeList {
  const read = (track as MediaStreamTrack & { getCapabilities?: () => ModeList }).getCapabilities;
  if (!read) return {};
  try {
    return read.call(track) ?? {};
  } catch {
    return {};
  }
}

async function applyMode(track: MediaStreamTrack, constraint: Record<string, unknown>) {
  try {
    await track.applyConstraints({ advanced: [constraint] } as MediaTrackConstraints);
    return true;
  } catch {
    try {
      await track.applyConstraints(constraint as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}

/** Continuous autofocus, exposure, and white balance, when this camera allows them. */
export async function enableContinuousAutofocus(track: MediaStreamTrack) {
  const caps = trackCapabilities(track);
  if (caps.focusMode?.includes("continuous")) {
    await applyMode(track, { focusMode: "continuous" });
  } else if (caps.focusMode?.includes("single-shot")) {
    await applyMode(track, { focusMode: "single-shot" });
  }
  if (caps.exposureMode?.includes("continuous")) {
    await applyMode(track, { exposureMode: "continuous" });
  }
  if (caps.whiteBalanceMode?.includes("continuous")) {
    await applyMode(track, { whiteBalanceMode: "continuous" });
  }
}

/** Hunt focus again. A point targets the spot that was tapped, in 0–1 sensor coordinates. */
export async function refocusCamera(track: MediaStreamTrack, point?: FocusPoint) {
  const caps = trackCapabilities(track);
  const modes = caps.focusMode ?? [];
  const aimed = point && caps.pointsOfInterest;
  if (aimed && modes.length) {
    const mode = modes.includes("single-shot") ? "single-shot" : "continuous";
    await applyMode(track, { focusMode: mode, pointsOfInterest: [point] });
    if (mode !== "continuous" && modes.includes("continuous")) {
      window.setTimeout(() => {
        void applyMode(track, { focusMode: "continuous" });
      }, 700);
    }
    return;
  }
  if (modes.includes("single-shot")) {
    await applyMode(track, { focusMode: "single-shot" });
  }
  if (modes.includes("continuous")) {
    await applyMode(track, { focusMode: "continuous" });
  }
}

/** Re-assert continuous focus so a phone does not lock on the first distance. */
export function watchAutofocus(track: MediaStreamTrack) {
  void enableContinuousAutofocus(track);
  const timer = window.setInterval(() => {
    void enableContinuousAutofocus(track);
  }, 4000);
  return () => window.clearInterval(timer);
}

export function videoTrack(stream: MediaStream | null) {
  return stream?.getVideoTracks()[0] ?? null;
}

export function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function videoChoices(facing: CameraFacing | undefined, shape: "photo" | "video") {
  const face = facing ? { facingMode: { ideal: facing } } : {};
  const sizes =
    shape === "photo"
      ? [
          { width: { ideal: 2560 }, height: { ideal: 1920 } },
          { width: { ideal: 1920 }, height: { ideal: 1440 } },
          { width: { ideal: 1920 }, height: { ideal: 1080 } },
        ]
      : [
          { width: { ideal: 1920 }, height: { ideal: 1080 } },
          { width: { ideal: 1280 }, height: { ideal: 720 } },
        ];
  const choices: Array<MediaTrackConstraints | boolean> = sizes.map((size) => ({ ...face, ...size }));
  if (facing) choices.push(face);
  choices.push(true);
  return choices;
}

export async function openCamera(options: {
  facing?: CameraFacing;
  audio?: boolean;
  shape?: "photo" | "video";
}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser will not open the camera.");
  }
  const audio = options.audio === true;
  const tries: MediaStreamConstraints[] = [];
  for (const video of videoChoices(options.facing, options.shape ?? "photo")) {
    if (audio) tries.push({ audio: true, video });
    tries.push({ audio: false, video });
  }
  let lastError: unknown = new Error("The camera did not start.");
  for (const constraints of tries) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = videoTrack(stream);
      if (track) await enableContinuousAutofocus(track);
      return stream;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function requestCamera(facing: CameraFacing) {
  try {
    return await openCamera({ facing, audio: false, shape: "photo" });
  } catch {
    return null;
  }
}

/** Map a tap on an object-contain video to sensor coordinates. Null when the tap is on the black bars. */
export function focusPointFromTap(video: HTMLVideoElement, clientX: number, clientY: number, mirror: boolean) {
  const rect = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const frameWidth = video.videoWidth || rect.width;
  const frameHeight = video.videoHeight || rect.height;
  const elementRatio = rect.width / rect.height;
  const frameRatio = frameWidth / frameHeight;
  let drawWidth = rect.width;
  let drawHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;
  if (elementRatio > frameRatio) {
    drawWidth = rect.height * frameRatio;
    offsetX = (rect.width - drawWidth) / 2;
  } else {
    drawHeight = rect.width / frameRatio;
    offsetY = (rect.height - drawHeight) / 2;
  }
  const x = (clientX - rect.left - offsetX) / drawWidth;
  const y = (clientY - rect.top - offsetY) / drawHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: mirror ? 1 - x : x, y };
}
