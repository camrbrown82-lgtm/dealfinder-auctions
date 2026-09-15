import { parseApiJson } from "@/lib/apiJson";
import { compressImageFiles } from "@/lib/compressImage";

export async function requestStudioImage(payload: {
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
}) {
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
  const json = await parseApiJson<{
    studio_image_url?: string;
    error?: string;
    ai?: { ids?: string[]; features?: Array<"catalog" | "comps" | "studio"> };
  }>(response);
  if (!response.ok || !json.studio_image_url) {
    throw new Error(json.error || "Could not create a listing photo.");
  }
  return {
    url: json.studio_image_url,
    ai: {
      ids: json.ai?.ids ?? [],
      features: json.ai?.features ?? ["studio"],
    },
  };
}
