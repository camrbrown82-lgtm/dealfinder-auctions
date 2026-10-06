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
  hero_index?: number;
  ai?: AiRun;
  imageUrls: string[];
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function requestCatalog(
  files: File[],
  pasted: string,
  extras?: { itemDetails?: string; listingGrade?: string },
): Promise<CatalogResult> {
  const photos = await compressImageFiles(files);
  const fromPaste = parsePastedImageUrls(pasted);
  let imageUrls = [...fromPaste];

  if (photos.length) {
    try {
      imageUrls = [...fromPaste, ...(await filesToConsignmentUrls(photos))].slice(0, 4);
    } catch {
      imageUrls = fromPaste;
    }
  }

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
    for (const url of fromPaste) form.append("imageUrls", url);
    for (const file of photos) form.append("images", file);
    if (extras?.itemDetails) form.set("itemDetails", extras.itemDetails);
    form.set("listingGrade", extras?.listingGrade ?? "Used");
    response = await fetch("/api/ai-intake", { method: "POST", body: form });
  }

  const json = await parseApiJson<CatalogResult & { error?: string }>(response);
  if (!response.ok) throw new Error(json.error || "AI intake failed");

  return { ...json, imageUrls: imageUrls.length ? imageUrls : fromPaste };
}

export function heroPhotoForStudio(catalog: CatalogResult, photos: File[]) {
  const heroAt = catalog.imageUrls.length
    ? Math.min(Math.max(catalog.hero_index ?? 0, 0), catalog.imageUrls.length - 1)
    : Math.min(Math.max(catalog.hero_index ?? 0, 0), Math.max(photos.length - 1, 0));
  const heroUrl = catalog.imageUrls[heroAt];
  if (heroUrl && isHttpUrl(heroUrl)) return { imageUrls: [heroUrl], files: [] as File[] };
  const file = photos[heroAt] ?? photos[0];
  return { imageUrls: heroUrl ? [heroUrl] : [], files: file ? [file] : [] };
}
