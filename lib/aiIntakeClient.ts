import { parseApiJson } from "@/lib/apiJson";
import { compressImageFiles } from "@/lib/compressImage";
import { filesToConsignmentUrls } from "@/lib/files";
import { parsePastedImageUrls } from "@/lib/imageUrls";
import type { AiRun } from "@/lib/aiRuns";

export type CatalogResult = {
  title: string;
  description: string;
  object_type?: string;
  materials?: string[];
  condition?: string;
  display_setting?: string;
  photo_brief?: string;
  estimated_market_value?: number;
  suggested_reserve?: number;
  comps_note?: string;
  ai?: AiRun;
  imageUrls: string[];
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function prepareIntakeImages(files: File[], pasted: string) {
  const photos = await compressImageFiles(files, 1280, 0.82);
  const fromPaste = parsePastedImageUrls(pasted);
  let imageUrls = [...fromPaste];
  if (photos.length) {
    try {
      imageUrls = [...fromPaste, ...(await filesToConsignmentUrls(photos))].slice(0, 4);
    } catch {
      imageUrls = fromPaste;
    }
  }
  return { photos, imageUrls };
}

export async function requestCatalogFromUrls(
  imageUrls: string[],
  extras?: { itemDetails?: string; listingGrade?: string },
  photos: File[] = [],
): Promise<CatalogResult> {
  let response: Response;
  if (imageUrls.length && imageUrls.every(isHttpUrl)) {
    response = await fetch("/api/ai-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrls,
        itemDetails: extras?.itemDetails ?? "",
        listingGrade: extras?.listingGrade ?? "Used",
      }),
    });
  } else {
    const form = new FormData();
    for (const url of imageUrls) form.append("imageUrls", url);
    for (const file of photos) form.append("images", file);
    if (extras?.itemDetails) form.set("itemDetails", extras.itemDetails);
    form.set("listingGrade", extras?.listingGrade ?? "Used");
    response = await fetch("/api/ai-intake", { method: "POST", body: form });
  }

  const json = await parseApiJson<CatalogResult & { error?: string }>(response);
  if (!response.ok) throw new Error(json.error || "AI intake failed");
  return { ...json, imageUrls: imageUrls.length ? imageUrls : json.imageUrls ?? [] };
}

export async function requestCatalog(
  files: File[],
  pasted: string,
  extras?: { itemDetails?: string; listingGrade?: string },
): Promise<CatalogResult> {
  const prepared = await prepareIntakeImages(files, pasted);
  return requestCatalogFromUrls(prepared.imageUrls, extras, prepared.photos);
}
