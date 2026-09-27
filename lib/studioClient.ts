import { parseApiJson } from "@/lib/apiJson";
import { compressImageFiles } from "@/lib/compressImage";
import type { SlothPhotoPhase } from "@/lib/turboSloth";

type StudioEvent = {
  phase?: SlothPhotoPhase | "done" | "error";
  studio_image_url?: string;
  error?: string;
  hero_index?: number;
  gallery_count?: number;
  ai?: { ids?: string[]; features?: Array<"catalog" | "comps" | "studio"> };
};

async function readStudioEvents(
  response: Response,
  onPhase?: (phase: SlothPhotoPhase) => void,
) {
  if (!response.ok || !response.body) {
    const json = await parseApiJson<{ error?: string }>(response);
    throw new Error(json.error || "Could not create a listing photo.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: StudioEvent | null = null;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as StudioEvent;
      if (event.phase === "selecting" || event.phase === "processing") onPhase?.(event.phase);
      if (event.phase === "error") {
        await reader.cancel();
        throw new Error(event.error || "Could not create a listing photo.");
      }
      if (event.phase === "done") doneEvent = event;
    }
    if (chunk.done) break;
  }
  if (!doneEvent?.studio_image_url) {
    throw new Error("Could not create a listing photo.");
  }
  return doneEvent;
}

export async function requestStudioImage(
  payload: {
  imageUrls: string[];
  files?: File[];
  title: string;
  objectType?: string;
  materials?: string[];
  condition?: string;
  itemDetails?: string;
  listingGrade?: string;
  displaySetting?: string;
  photoBrief?: string;
},
  onPhase?: (phase: SlothPhotoPhase) => void,
) {
  const httpUrls = payload.imageUrls.filter((url) => /^https?:\/\//i.test(url));
  let response: Response;
  if (httpUrls.length) {
    response = await fetch("/api/ai-intake/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrls: httpUrls,
        title: payload.title,
        objectType: payload.objectType,
        materials: payload.materials,
        condition: payload.condition,
        itemDetails: payload.itemDetails,
        listingGrade: payload.listingGrade,
        displaySetting: payload.displaySetting,
        photoBrief: payload.photoBrief,
      }),
    });
  } else {
    const form = new FormData();
    form.set("title", payload.title);
    if (payload.objectType) form.set("objectType", payload.objectType);
    if (payload.condition) form.set("condition", payload.condition);
    if (payload.itemDetails) form.set("itemDetails", payload.itemDetails);
    if (payload.listingGrade) form.set("listingGrade", payload.listingGrade);
    if (payload.displaySetting) form.set("displaySetting", payload.displaySetting);
    if (payload.photoBrief) form.set("photoBrief", payload.photoBrief);
    for (const material of payload.materials ?? []) form.append("materials", material);
    for (const url of payload.imageUrls) form.append("imageUrls", url);
    const photos = await compressImageFiles(payload.files ?? []);
    for (const file of photos) form.append("images", file);
    response = await fetch("/api/ai-intake/studio", { method: "POST", body: form });
  }
  const json = await readStudioEvents(response, onPhase);
  return {
    url: json.studio_image_url!,
    heroIndex: json.hero_index ?? 0,
    galleryCount: json.gallery_count ?? 0,
    ai: {
      ids: json.ai?.ids ?? [],
      features: json.ai?.features ?? ["studio"],
    },
  };
}
